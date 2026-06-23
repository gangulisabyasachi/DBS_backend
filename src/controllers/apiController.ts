import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Card from '../models/Card';
import Retailer from '../models/Retailer';
import Quota from '../models/Quota';
import Transaction from '../models/Transaction';
import Permit from '../models/Permit';

// POST /auth/card
export const authenticateCard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { cardId } = req.body;
    const card = await Card.findById(cardId);
    if (!card) { res.status(404).json({ status: 'DENIED', reason: 'Card not found' }); return; }
    if (card.status !== 'Active') { res.status(403).json({ status: 'DENIED', reason: `Card is ${card.status}` }); return; }
    const quota = await Quota.findOne({ cardId: card._id }).sort({ periodStart: -1 });
    if (!quota) { res.status(404).json({ status: 'DENIED', reason: 'No active quota found' }); return; }
    res.status(200).json({
      status: 'OK',
      cardholderName: card.cardholderName,
      cardStatus: card.status,
      remainingQuota: quota.volumeAllocated - quota.volumeSpent,
      periodEnd: quota.periodEnd,
    });
  } catch (e) { res.status(500).json({ status: 'ERROR', message: 'Internal server error' }); }
};

// POST /purchase  — ACID transaction
export const processPurchase = async (req: Request, res: Response): Promise<void> => {
  const { cardId, volume, txnId, retailerId } = req.body;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const existingTxn = await Transaction.findOne({ txnId }).session(session);
    if (existingTxn) {
      await session.abortTransaction();
      res.status(200).json({ status: existingTxn.status, message: 'Duplicate transaction ignored' });
      return;
    }

    const card = await Card.findById(cardId).session(session);
    if (!card || card.status !== 'Active') {
      await session.abortTransaction();
      res.status(403).json({ status: 'Denied', reason: card ? `Card is ${card.status}` : 'Card not found' });
      return;
    }

    const quota = await Quota.findOne({ cardId }).sort({ periodStart: -1 }).session(session);
    if (!quota) {
      await session.abortTransaction();
      res.status(404).json({ status: 'Denied', reason: 'Quota record not found' });
      return;
    }

    const remaining = quota.volumeAllocated - quota.volumeSpent;
    if (remaining < volume) {
      await session.abortTransaction();
      // Log the denied transaction
      await new Transaction({
        txnId, cardId, cardholderName: card.cardholderName,
        retailerId, retailerName: '', volume,
        status: 'Denied', source: 'Online', timestamp: new Date()
      }).save();
      res.status(409).json({ status: 'Denied', reason: 'Insufficient quota', remainingQuota: remaining });
      return;
    }

    const retailer = await Retailer.findOne({ retailerId }).lean();
    quota.volumeSpent += volume;
    await quota.save({ session });

    const newTxn = new Transaction({
      txnId, cardId, cardholderName: card.cardholderName,
      retailerId, retailerName: retailer?.name || retailerId,
      volume, status: 'Approved', source: 'Online', timestamp: new Date()
    });
    await newTxn.save({ session });
    await session.commitTransaction();

    res.status(200).json({
      status: 'Approved',
      newQuota: quota.volumeAllocated - quota.volumeSpent,
      txnId: newTxn.txnId,
      cardholderName: card.cardholderName,
    });
  } catch (e) {
    await session.abortTransaction();
    res.status(500).json({ status: 'ERROR', message: 'Transaction failed and rolled back' });
  } finally { session.endSession(); }
};

// POST /sync/transactions  — Offline batch sync
export const syncTransactions = async (req: Request, res: Response): Promise<void> => {
  const { transactions } = req.body;
  if (!transactions || !Array.isArray(transactions)) {
    res.status(400).json({ message: 'transactions array required' }); return;
  }
  const results = [];
  for (const txn of transactions) {
    try {
      const existing = await Transaction.findOne({ txnId: txn.txnId });
      if (existing) { results.push({ txnId: txn.txnId, status: 'duplicate' }); continue; }
      await new Transaction({ ...txn, source: 'Offline', status: 'Synced', timestamp: new Date(txn.timestamp) }).save();
      results.push({ txnId: txn.txnId, status: 'synced' });
    } catch { results.push({ txnId: txn.txnId, status: 'error' }); }
  }
  res.json({ synced: results.filter(r => r.status === 'synced').length, results });
};

// GET /retailer/sales?retailerId=STORE-001
export const getRetailerSales = async (req: Request, res: Response): Promise<void> => {
  const { retailerId } = req.query;
  if (!retailerId || typeof retailerId !== 'string') {
    res.status(400).json({ message: 'retailerId query parameter must be a string' });
    return;
  }
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const txns = await Transaction.find({
      retailerId,
      timestamp: { $gte: today, $lt: tomorrow }
    }).sort({ timestamp: -1 }).lean();

    const totalVolume = txns.filter(t => t.status === 'Approved').reduce((s, t) => s + t.volume, 0);
    res.json({ transactions: txns, totalVolume: parseFloat(totalVolume.toFixed(2)), count: txns.length });
  } catch (e) { res.status(500).json({ message: 'Error fetching sales' }); }
};

// POST /cardholder/lookup — Secure single card lookup with cardId and citizenId validation
export const cardholderLookup = async (req: Request, res: Response): Promise<void> => {
  const { cardId, cardholderId } = req.body;
  if (!cardId || !cardholderId) {
    res.status(400).json({ message: 'Both Card ID and Citizen/Cardholder ID are required.' });
    return;
  }
  try {
    const card = await Card.findOne({ _id: cardId, cardholderId });
    if (!card) {
      res.status(404).json({ message: 'No card matches the provided Card ID and Citizen ID.' });
      return;
    }
    const quota = await Quota.findOne({ cardId: card._id }).sort({ periodStart: -1 }).lean();
    const txns = await Transaction.find({ cardId: card._id }).sort({ timestamp: -1 }).lean();
    res.json({
      card: {
        id: card._id,
        cardholderId: card.cardholderId,
        cardholderName: card.cardholderName,
        status: card.status,
        type: card.type,
      },
      quota: quota ? {
        volumeAllocated: quota.volumeAllocated,
        volumeSpent: quota.volumeSpent,
        remainingQuota: quota.volumeAllocated - quota.volumeSpent,
        periodStart: quota.periodStart,
        periodEnd: quota.periodEnd,
      } : null,
      transactions: txns,
      activePermits: [] 
    });
  } catch (e) {
    res.status(500).json({ message: 'Secure lookup failed.' });
  }
};

// Helper function to calculate distance between two lat/lng pairs in kilometers
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

// POST /purchase/initiate — Step 1: Create a pending transaction (No quota deducted)
export const initiatePurchase = async (req: Request, res: Response): Promise<void> => {
  let { cardId, volume, txnId, retailerId } = req.body;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const existingTxn = await Transaction.findOne({ txnId }).session(session);
    if (existingTxn) {
      await session.abortTransaction();
      res.status(200).json({ status: existingTxn.status, message: 'Duplicate transaction ignored' });
      return;
    }

    const retailer = await Retailer.findOne({ retailerId }).lean();
    if (!retailer) {
      await session.abortTransaction();
      res.status(404).json({ status: 'Denied', reason: 'Retailer not found' });
      return;
    }

    const card = await Card.findById(cardId).session(session);
    if (!card || card.status !== 'Active') {
      await session.abortTransaction();
      res.status(403).json({ status: 'Denied', reason: card ? `Card is ${card.status}` : 'Card not found' });
      return;
    }

    // Geofencing Check
    if (retailer.location && retailer.location.lat && retailer.location.lng) {
      const lastTxn = await Transaction.findOne({ cardId, status: { $in: ['Approved', 'Pending', 'Synced'] } }).sort({ timestamp: -1 }).lean();
      if (lastTxn && lastTxn.location && lastTxn.location.lat && lastTxn.location.lng) {
        const distance = getDistanceFromLatLonInKm(
          lastTxn.location.lat, lastTxn.location.lng,
          retailer.location.lat, retailer.location.lng
        );
        const timeDiffHours = (Date.now() - new Date(lastTxn.timestamp).getTime()) / (1000 * 60 * 60);
        if (timeDiffHours > 0) {
          const speed = distance / timeDiffHours;
          if (speed > 900) {
            await session.abortTransaction();

            // Automatically block the card
            await Card.findByIdAndUpdate(cardId, { status: 'Suspended' });

            await new Transaction({
              txnId, cardId, cardholderName: card.cardholderName,
              retailerId, retailerName: retailer.name, volume: req.body.volume,
              status: 'Rejected', source: 'Online', timestamp: new Date(),
              location: retailer.location
            }).save();

            res.status(403).json({
              status: 'Denied',
              reason: `Fraud Detected: Implausible Travel Time (Implied Speed: ${Math.round(speed)} km/h). Card has been automatically SUSPENDED.`
            });
            return;
          }
        }
      }
    }



    const quota = await Quota.findOne({ cardId }).sort({ periodStart: -1 }).session(session);
    if (!quota) {
      await session.abortTransaction();
      res.status(404).json({ status: 'Denied', reason: 'Quota record not found' });
      return;
    }

    const remaining = quota.volumeAllocated - quota.volumeSpent;
    if (remaining < volume) {
      await session.abortTransaction();
      // Log the denied transaction directly
      await new Transaction({
        txnId, cardId, cardholderName: card.cardholderName,
        retailerId, retailerName: retailer.name, volume,
        status: 'Denied', source: 'Online', timestamp: new Date(),
        location: retailer.location
      }).save();
      res.status(409).json({ status: 'Denied', reason: 'Insufficient quota', remainingQuota: remaining });
      return;
    }

    // Create pending transaction WITHOUT deducting quota
    const newTxn = new Transaction({
      txnId, cardId, cardholderName: card.cardholderName,
      retailerId, retailerName: retailer.name,
      volume, status: 'Pending', source: 'Online', timestamp: new Date(),
      location: retailer.location
    });
    await newTxn.save({ session });
    await session.commitTransaction();

    res.status(200).json({
      status: 'Pending',
      txnId: newTxn.txnId,
      cardholderName: card.cardholderName,
    });
  } catch (e) {
    await session.abortTransaction();
    res.status(500).json({ status: 'ERROR', message: 'Transaction initiation failed' });
  } finally { session.endSession(); }
};

// GET /purchase/pending/:retailerId — Fetch pending transactions for clerk
export const getPendingTransactions = async (req: Request, res: Response): Promise<void> => {
  const { retailerId } = req.params;
  if (!retailerId) {
    res.status(400).json({ message: 'retailerId is required' });
    return;
  }
  try {
    const txns = await Transaction.find({ retailerId, status: 'Pending' }).sort({ timestamp: -1 }).lean();
    res.json({ transactions: txns });
  } catch (e) { res.status(500).json({ message: 'Error fetching pending transactions' }); }
};

// POST /purchase/resolve — Step 2: Clerk approves or cancels
export const resolvePurchase = async (req: Request, res: Response): Promise<void> => {
  const { txnId, action } = req.body; // action: 'PAID' or 'CANCELLED'
  if (!txnId || !['PAID', 'CANCELLED'].includes(action)) {
    res.status(400).json({ message: 'Invalid txnId or action' }); return;
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const txn = await Transaction.findOne({ txnId, status: 'Pending' }).session(session);
    if (!txn) {
      await session.abortTransaction(); res.status(404).json({ message: 'Pending transaction not found' }); return;
    }

    if (action === 'CANCELLED') {
      txn.status = 'Rejected';
      await txn.save({ session });
      await session.commitTransaction();
      res.json({ status: 'Rejected' });
      return;
    }

    // action === 'PAID'
    const quota = await Quota.findOne({ cardId: txn.cardId }).sort({ periodStart: -1 }).session(session);
    if (!quota) {
      await session.abortTransaction(); res.status(404).json({ message: 'Quota not found' }); return;
    }

    const remaining = quota.volumeAllocated - quota.volumeSpent;
    if (remaining < txn.volume) {
      txn.status = 'Denied';
      await txn.save({ session });
      await session.commitTransaction();
      res.status(409).json({ message: 'Insufficient quota', remainingQuota: remaining });
      return;
    }

    // Deduct quota
    quota.volumeSpent += txn.volume;
    await quota.save({ session });



    txn.status = 'Approved';
    await txn.save({ session });
    await session.commitTransaction();
    res.json({ status: 'Approved', txnId });
  } catch (e) {
    await session.abortTransaction();
    res.status(500).json({ message: 'Failed to resolve transaction' });
  } finally { session.endSession(); }
};

// POST /cardholder/permit/request
export const requestPermit = async (req: Request, res: Response): Promise<void> => {
  const { cardId, cardholderId, reason, requestedVolume } = req.body;
  if (!cardId || !cardholderId || !reason || !requestedVolume) {
    res.status(400).json({ message: 'Missing fields' });
    return;
  }
  try {
    const card = await Card.findOne({ _id: cardId, cardholderId });
    if (!card) { res.status(404).json({ message: 'Card not found or ID mismatch' }); return; }

    const permit = new Permit({
      cardId, cardholderName: card.cardholderName, reason, requestedVolume
    });
    await permit.save();
    res.status(201).json(permit);
  } catch (e) {
    res.status(500).json({ message: 'Failed to request permit' });
  }
};

// POST /cardholder/permit/list
export const getCardholderPermits = async (req: Request, res: Response): Promise<void> => {
  const { cardId, cardholderId } = req.body;
  if (!cardId || !cardholderId) { res.status(400).json({ message: 'Missing fields' }); return; }
  try {
    const card = await Card.findOne({ _id: cardId, cardholderId });
    if (!card) { res.status(404).json({ message: 'Card not found or ID mismatch' }); return; }

    const permits = await Permit.find({ cardId }).sort({ createdAt: -1 }).lean();
    res.json(permits);
  } catch (e) {
    res.status(500).json({ message: 'Failed to list permits' });
  }
};


