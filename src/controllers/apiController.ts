import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Card from '../models/Card';
import Quota from '../models/Quota';
import Transaction from '../models/Transaction';

export const authenticateCard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { cardId } = req.body;
    const card = await Card.findById(cardId);
    
    if (!card) {
      res.status(404).json({ status: 'DENIED', reason: 'Card not found' });
      return;
    }
    
    if (card.status !== 'Active') {
      res.status(403).json({ status: 'DENIED', reason: `Card is ${card.status}` });
      return;
    }

    const quota = await Quota.findOne({ cardId: card._id }).sort({ periodStart: -1 });
    
    if (!quota) {
      res.status(404).json({ status: 'DENIED', reason: 'No active quota found for this period' });
      return;
    }

    res.status(200).json({
      status: 'OK',
      cardStatus: card.status,
      remainingQuota: quota.volumeAllocated - quota.volumeSpent,
      periodEnd: quota.periodEnd
    });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: 'Internal server error' });
  }
};

export const processPurchase = async (req: Request, res: Response): Promise<void> => {
  const { cardId, volume, txnId, retailerId } = req.body;

  // Start MongoDB Session for ACID Transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Idempotency Check
    const existingTxn = await Transaction.findOne({ txnId }).session(session);
    if (existingTxn) {
      // If network retry happened, just return success again (Idempotency)
      await session.abortTransaction();
      res.status(200).json({ status: existingTxn.status, message: 'Duplicate transaction ignored' });
      return;
    }

    // 2. Fetch Quota with locking via session
    const quota = await Quota.findOne({ cardId }).sort({ periodStart: -1 }).session(session);
    if (!quota) {
      await session.abortTransaction();
      res.status(404).json({ status: 'Denied', reason: 'Quota record not found' });
      return;
    }

    const remaining = quota.volumeAllocated - quota.volumeSpent;
    
    // 3. Mathematical check
    if (remaining < volume) {
      await session.abortTransaction();
      res.status(409).json({ status: 'Denied', reason: 'Insufficient quota', remainingQuota: remaining });
      return;
    }

    // 4. Atomic Update
    quota.volumeSpent += volume;
    await quota.save({ session });

    // 5. Audit Log (Transaction Insert)
    const newTxn = new Transaction({
      txnId,
      cardId,
      retailerId,
      volume,
      status: 'Approved',
      source: 'Online',
      timestamp: new Date()
    });
    await newTxn.save({ session });

    // 6. COMMIT
    await session.commitTransaction();

    res.status(200).json({
      status: 'Approved',
      newQuota: quota.volumeAllocated - quota.volumeSpent,
      txnId: newTxn.txnId
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("Transaction Error:", error);
    res.status(500).json({ status: 'ERROR', message: 'Transaction failed and rolled back' });
  } finally {
    session.endSession();
  }
};

export const syncTransactions = async (req: Request, res: Response): Promise<void> => {
  // Simplified for prototype: normally would verify HMAC signatures here
  res.status(200).json({ status: 'SYNCED', message: 'Offline batches received' });
};
