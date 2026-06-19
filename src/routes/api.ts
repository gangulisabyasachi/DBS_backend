import { Router } from 'express';
import { authenticateCard, processPurchase, syncTransactions, getRetailerSales, cardholderLookup } from '../controllers/apiController';
import {
  getStats, listCards, issueCard, updateCardStatus, editCard,
  onboardRetailer, listRetailers, resetQuotaPeriod, rotateApiKey
} from '../controllers/adminController';
import { getTransactions, getQuotas, getAuditStats, getCards } from '../controllers/auditController';
import {
  login, retailerLogin, clerkLogin,
  listUsers, createUser, updateUser, deleteUser,
  listRetailersForDev, setRetailerPassword,
  listClerks, createClerk, updateClerk, deleteClerk
} from '../controllers/authController';
import { verifyToken, requireRole } from '../middleware/authMiddleware';

const router = Router();

// ── Public / POS / Auth ───────────────────────────────────────────────────────
router.post('/auth/card', authenticateCard);
router.post('/purchase', processPurchase);
router.post('/sync/transactions', syncTransactions);
router.get('/retailer/sales', getRetailerSales);
router.post('/cardholder/lookup', cardholderLookup);

// Auth endpoints (public)
router.post('/auth/login', login);                 // Admin / Auditor / Developer
router.post('/auth/retailer-login', retailerLogin); // Retailer
router.post('/auth/clerk-login', clerkLogin);       // Clerk

// ── Admin (Protected) ─────────────────────────────────────────────────────────
const adminAuth = [verifyToken, requireRole(['Admin'])];
router.get('/admin/stats', adminAuth, getStats);
router.get('/admin/cards', adminAuth, listCards);
router.post('/admin/cards', adminAuth, issueCard);
router.put('/admin/cards/:id/status', adminAuth, updateCardStatus);
router.put('/admin/cards/:id', adminAuth, editCard);
router.get('/admin/retailers', adminAuth, listRetailers);
router.post('/admin/retailers', adminAuth, onboardRetailer);
router.post('/admin/quota/reset', adminAuth, resetQuotaPeriod);
router.post('/admin/rotate-key/:retailerId', adminAuth, rotateApiKey);

// ── Audit / Read-only (Protected) ─────────────────────────────────────────────
const auditAuth = [verifyToken, requireRole(['Admin', 'Auditor', 'Clerk'])];
router.get('/audit/transactions', auditAuth, getTransactions);
router.get('/audit/quotas', auditAuth, getQuotas);
router.get('/audit/stats', auditAuth, getAuditStats);
router.get('/audit/cards', auditAuth, getCards);

// ── Developer Portal (Protected) ─────────────────────────────────────────────
const devAuth = [verifyToken, requireRole(['Developer'])];
// User management
router.get('/dev/users', devAuth, listUsers);
router.post('/dev/users', devAuth, createUser);
router.put('/dev/users/:id', devAuth, updateUser);
router.delete('/dev/users/:id', devAuth, deleteUser);
// Retailer password management
router.get('/dev/retailers', devAuth, listRetailersForDev);
router.put('/dev/retailers/:id/password', devAuth, setRetailerPassword);
// Clerk management
router.get('/dev/clerks', devAuth, listClerks);
router.post('/dev/clerks', devAuth, createClerk);
router.put('/dev/clerks/:id', devAuth, updateClerk);
router.delete('/dev/clerks/:id', devAuth, deleteClerk);

export default router;
