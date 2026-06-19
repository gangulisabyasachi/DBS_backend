import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Card from '../models/Card';
import Quota from '../models/Quota';
import Transaction from '../models/Transaction';
import Retailer from '../models/Retailer';

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
    });
  } catch (e) {
    res.status(500).json({ message: 'Secure lookup failed.' });
  }
};

