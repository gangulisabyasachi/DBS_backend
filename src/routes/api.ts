import { Router } from 'express';
import { authenticateCard, processPurchase, syncTransactions } from '../controllers/apiController';

const router = Router();

// Endpoint to verify a card ID and fetch the current quota balance
router.post('/auth/card', authenticateCard);

// Endpoint to process an online purchase (ACID Transaction)
router.post('/purchase', processPurchase);

// Endpoint to upload offline transactions (Batch Sync)
router.post('/sync/transactions', syncTransactions);

export default router;
