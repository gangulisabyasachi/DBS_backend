import { Request, Response } from 'express';
import Transaction from '../models/Transaction';
import Quota from '../models/Quota';
import Card from '../models/Card';

// GET /audit/transactions?status=&cardId=&retailerId=&date=&source=
export const getTransactions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, cardId, retailerId, date, source } = req.query;
    const filter: Record<string, unknown> = {};

    if (status && status !== 'All') filter.status = status;
    if (cardId) filter.cardId = cardId;
    if (retailerId && retailerId !== 'All') filter.retailerId = retailerId;
    if (source && source !== 'All') filter.source = source;
    if (date) {
      const d = new Date(date as string);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      filter.timestamp = { $gte: d, $lt: next };
    }

    const txns = await Transaction.find(filter).sort({ timestamp: -1 }).limit(200).lean();
    res.json(txns);
  } catch (e) { res.status(500).json({ message: 'Error fetching transactions' }); }
};

// GET /audit/quotas
export const getQuotas = async (req: Request, res: Response): Promise<void> => {
  try {
    const quotas = await Quota.find().sort({ createdAt: -1 }).lean();
    const cardIds = quotas.map(q => q.cardId);
    const cards = await Card.find({ _id: { $in: cardIds } }).lean();
    const cardMap = new Map(cards.map(c => [c._id.toString(), c]));
    const result = quotas.map(q => ({
      ...q,
      cardId: cardMap.get(q.cardId.toString()) || null,
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ message: 'Error fetching quotas' }); }
};

// GET /audit/stats
export const getAuditStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const [total, approved, denied, offline] = await Promise.all([
      Transaction.countDocuments(),
      Transaction.countDocuments({ status: 'Approved' }),
      Transaction.countDocuments({ status: { $in: ['Denied', 'Rejected'] } }),
      Transaction.countDocuments({ source: 'Offline' }),
    ]);
    res.json({ total, approved, denied, offline });
  } catch (e) { res.status(500).json({ message: 'Error fetching stats' }); }
};

// GET /audit/cards  — full card list for admin lookup
export const getCards = async (req: Request, res: Response): Promise<void> => {
  try {
    const cards = await Card.find().sort({ createdAt: -1 }).lean();
    res.json(cards);
  } catch (e) { res.status(500).json({ message: 'Error fetching cards' }); }
};
