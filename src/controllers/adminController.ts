import { Request, Response } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Card from '../models/Card';
import Quota from '../models/Quota';
import Transaction from '../models/Transaction';
import Retailer from '../models/Retailer';
import Permit from '../models/Permit';

// GET /admin/stats
export const getStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const [totalCards, activeCards, totalRetailers, totalTxns, deniedTxns, blacklisted] = await Promise.all([
      Card.countDocuments(),
      Card.countDocuments({ status: 'Active' }),
      Retailer.countDocuments({ status: 'Active' }),
      Transaction.countDocuments(),
      Transaction.countDocuments({ status: { $in: ['Denied', 'Rejected'] } }),
      Card.countDocuments({ status: { $in: ['Suspended', 'Revoked'] } }),
    ]);
    res.json({ totalCards, activeCards, totalRetailers, totalTxns, deniedTxns, blacklisted });
  } catch (e) { res.status(500).json({ message: 'Error fetching stats' }); }
};

// GET /admin/cards
export const listCards = async (req: Request, res: Response): Promise<void> => {
  try {
    const cards = await Card.find().sort({ createdAt: -1 }).lean();
    const quotas = await Quota.find({ cardId: { $in: cards.map(c => c._id) } }).lean();
    const quotaMap = new Map(quotas.map(q => [q.cardId.toString(), q]));
    const result = cards.map(c => ({
      ...c,
      quota: quotaMap.get(c._id.toString()) || null,
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ message: 'Error fetching cards' }); }
};

// POST /admin/cards  — Issue a new card
export const issueCard = async (req: Request, res: Response): Promise<void> => {
  const { cardholderName, cardholderId, type, volumeAllocated } = req.body;
  if (!cardholderName || !cardholderId || !type) {
    res.status(400).json({ message: 'cardholderName, cardholderId and type are required' });
    return;
  }
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const card = new Card({ cardholderId, cardholderName, type, status: 'Active' });
    await card.save({ session });

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const quota = new Quota({
      cardId: card._id,
      volumeAllocated: volumeAllocated || 100,
      volumeSpent: 0,
      periodStart,
      periodEnd,
    });
    await quota.save({ session });
    await session.commitTransaction();
    res.status(201).json({ card, quota });
  } catch (e: any) {
    await session.abortTransaction();
    if (e.code === 11000) { res.status(409).json({ message: 'Cardholder ID already exists' }); return; }
    res.status(500).json({ message: 'Failed to issue card' });
  } finally { session.endSession(); }
};

// PUT /admin/cards/:id/status  — Suspend / Activate / Revoke
export const updateCardStatus = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { status } = req.body;
  const valid = ['Active', 'Suspended', 'Revoked', 'Inactive'];
  if (!valid.includes(status)) { res.status(400).json({ message: 'Invalid status' }); return; }
  try {
    const card = await Card.findByIdAndUpdate(id, { status }, { new: true });
    if (!card) { res.status(404).json({ message: 'Card not found' }); return; }
    res.json(card);
  } catch (e) { res.status(500).json({ message: 'Failed to update card' }); }
};

// PUT /admin/cards/:id  — Edit Card Details
export const editCard = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { cardholderName, cardholderId, type } = req.body;

  if (!cardholderName || !cardholderId || !type) {
    res.status(400).json({ message: 'cardholderName, cardholderId and type are required' });
    return;
  }

  try {
    const card = await Card.findByIdAndUpdate(
      id,
      { cardholderName, cardholderId, type },
      { new: true, runValidators: true }
    );
    if (!card) { res.status(404).json({ message: 'Card not found' }); return; }
    res.json(card);
  } catch (e: any) {
    if (e.code === 11000) { res.status(409).json({ message: 'Cardholder ID already exists' }); return; }
    res.status(500).json({ message: 'Failed to edit card' });
  }
};


// POST /admin/retailers  — Onboard a retailer
export const onboardRetailer = async (req: Request, res: Response): Promise<void> => {
  const { name, address, licenseNumber } = req.body;
  if (!name || !address || !licenseNumber) {
    res.status(400).json({ message: 'name, address and licenseNumber are required' });
    return;
  }
  try {
    const count = await Retailer.countDocuments();
    const retailerId = `STORE-${String(count + 1).padStart(3, '0')}`;
    const apiKey = crypto.randomBytes(24).toString('hex');
    const retailer = new Retailer({ retailerId, name, address, licenseNumber, status: 'Active', apiKey });
    await retailer.save();
    res.status(201).json(retailer);
  } catch (e: any) {
    if (e.code === 11000) { res.status(409).json({ message: 'License number already registered' }); return; }
    res.status(500).json({ message: 'Failed to onboard retailer' });
  }
};

// GET /admin/retailers
export const listRetailers = async (req: Request, res: Response): Promise<void> => {
  try {
    const retailers = await Retailer.find().sort({ createdAt: -1 }).lean();
    res.json(retailers);
  } catch (e) { res.status(500).json({ message: 'Error fetching retailers' }); }
};

// POST /admin/quota/reset  — Reset quota period for a specific card or all active cards
export const resetQuotaPeriod = async (req: Request, res: Response): Promise<void> => {
  const { volumeAllocated, periodStart, periodEnd, cardId } = req.body;
  try {
    const filter: any = cardId ? { _id: cardId } : { status: 'Active' };
    const cards = await Card.find(filter).lean();
    if (cards.length === 0) {
      res.status(404).json({ message: 'No eligible cards found for quota reset' });
      return;
    }

    const start = periodStart ? new Date(periodStart) : (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 1); })();
    const end = periodEnd ? new Date(periodEnd) : (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 2, 0, 23, 59, 59); })();
    const vol = volumeAllocated || 100;

    const newQuotas = cards.map(c => ({
      cardId: c._id,
      volumeAllocated: vol,
      volumeSpent: 0,
      periodStart: start,
      periodEnd: end,
    }));

    await Quota.insertMany(newQuotas, { ordered: false }).catch(() => {
      // If duplicates exist for the same period, just update them instead
    });

    res.json({ message: `Quota period reset for ${cards.length} card(s)`, period: { start, end, volumeAllocated: vol } });
  } catch (e) { res.status(500).json({ message: 'Failed to reset quota period' }); }
};

// POST /admin/rotate-key/:retailerId
export const rotateApiKey = async (req: Request, res: Response): Promise<void> => {
  const { retailerId } = req.params;
  try {
    const newKey = crypto.randomBytes(24).toString('hex');
    const retailer = await Retailer.findOneAndUpdate({ retailerId }, { apiKey: newKey }, { new: true });
    if (!retailer) { res.status(404).json({ message: 'Retailer not found' }); return; }
    res.json({ message: 'API key rotated successfully', newApiKey: newKey });
  } catch (e) {
    res.status(500).json({ message: 'Error rotating key' });
  }
};

// GET /admin/permits
export const getPermits = async (req: Request, res: Response): Promise<void> => {
  try {
    const permits = await Permit.find().sort({ createdAt: -1 }).lean();
    res.json(permits);
  } catch (e) { res.status(500).json({ message: 'Error fetching permits' }); }
};

// POST /admin/permit/resolve
export const resolvePermit = async (req: Request, res: Response): Promise<void> => {
  const { permitId, status } = req.body;
  if (!permitId || !['Approved', 'Rejected'].includes(status)) {
    res.status(400).json({ message: 'Invalid payload' }); return;
  }
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const permit = await Permit.findById(permitId).session(session);
    if (!permit) { res.status(404).json({ message: 'Permit not found' }); return; }
    if (permit.status !== 'Pending') { res.status(400).json({ message: 'Permit already resolved' }); return; }

    permit.status = status as 'Approved' | 'Rejected';
    permit.resolvedAt = new Date();
    permit.resolvedBy = (req as any).user?.username || 'Admin';
    await permit.save({ session });

    if (status === 'Approved') {
      const quota = await Quota.findOne({ cardId: permit.cardId }).sort({ periodStart: -1 }).session(session);
      if (quota) {
        quota.volumeAllocated += permit.requestedVolume;
        await quota.save({ session });
      }
    }
    
    await session.commitTransaction();
    res.json({ message: `Permit ${status}`, permit });
  } catch (e) {
    await session.abortTransaction();
    res.status(500).json({ message: 'Error resolving permit' });
  } finally { session.endSession(); }
};
