import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Retailer from '../models/Retailer';
import Clerk from '../models/Clerk';
import { AuthRequest } from '../middleware/authMiddleware';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-do-not-use-in-prod';

// ── Standard Login (Admin / Auditor / Developer) ──────────────────────────────
export const login = async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ message: 'Username and password are required' });
    return;
  }

  try {
    const user = await User.findOne({ username });
    if (!user) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({ token, user: { username: user.username, role: user.role } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error during login' });
  }
};

// ── Retailer Login (API Key + Password) ───────────────────────────────────────
export const retailerLogin = async (req: Request, res: Response): Promise<void> => {
  const { apiKey, password } = req.body;

  if (!apiKey || !password) {
    res.status(400).json({ message: 'API Key and password are required' });
    return;
  }

  try {
    const retailer = await Retailer.findOne({ apiKey });
    if (!retailer) {
      res.status(401).json({ message: 'Invalid API Key' });
      return;
    }
    if (retailer.status !== 'Active') {
      res.status(403).json({ message: `Retailer is ${retailer.status}` });
      return;
    }
    if (!retailer.passwordHash) {
      res.status(401).json({ message: 'Retailer password not set. Contact the Developer admin.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, retailer.passwordHash);
    if (!isMatch) {
      res.status(401).json({ message: 'Invalid password' });
      return;
    }

    const token = jwt.sign(
      { userId: retailer._id, username: retailer.name, role: 'Retailer', retailerId: retailer.retailerId },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({ token, user: { username: retailer.name, role: 'Retailer', retailerId: retailer.retailerId } });
  } catch (error) {
    console.error('Retailer login error:', error);
    res.status(500).json({ message: 'Internal server error during retailer login' });
  }
};

// ── Clerk Login (Retailer API Key + Clerk ID + Password) ──────────────────────
export const clerkLogin = async (req: Request, res: Response): Promise<void> => {
  const { apiKey, clerkId, password } = req.body;

  if (!apiKey || !clerkId || !password) {
    res.status(400).json({ message: 'Retailer API Key, Clerk ID, and password are required' });
    return;
  }

  try {
    const retailer = await Retailer.findOne({ apiKey });
    if (!retailer) {
      res.status(401).json({ message: 'Invalid Retailer API Key' });
      return;
    }
    if (retailer.status !== 'Active') {
      res.status(403).json({ message: `Retailer is ${retailer.status}` });
      return;
    }

    const clerk = await Clerk.findOne({ clerkId, retailerId: retailer.retailerId });
    if (!clerk) {
      res.status(401).json({ message: 'Clerk not found for this retailer' });
      return;
    }
    if (clerk.status !== 'Active') {
      res.status(403).json({ message: `Clerk account is ${clerk.status}` });
      return;
    }

    const isMatch = await bcrypt.compare(password, clerk.passwordHash);
    if (!isMatch) {
      res.status(401).json({ message: 'Invalid clerk password' });
      return;
    }

    const token = jwt.sign(
      { userId: clerk._id, username: clerk.name, role: 'Clerk', retailerId: retailer.retailerId, clerkId: clerk.clerkId },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: { username: clerk.name, role: 'Clerk', retailerId: retailer.retailerId, retailerName: retailer.name, clerkId: clerk.clerkId }
    });
  } catch (error) {
    console.error('Clerk login error:', error);
    res.status(500).json({ message: 'Internal server error during clerk login' });
  }
};

// ── Cardholder Login (Card ID + Citizen ID) ───────────────────────────────────
// This already exists as cardholderLookup in apiController.ts, no new endpoint needed.

// ── Seed default dev account ──────────────────────────────────────────────────
export const seedDev = async () => {
  try {
    const devExists = await User.findOne({ role: 'Developer' });
    if (!devExists) {
      const passwordHash = await bcrypt.hash('dev123', 10);
      await User.create({ username: 'dev', passwordHash, role: 'Developer' });
      console.log('✅ Default Developer seeded (dev / dev123)');
    }
  } catch (error) {
    console.error('Failed to seed default developer:', error);
  }
};

// ── Developer Portal: CRUD for Users ──────────────────────────────────────────

// GET /dev/users — List all users
export const listUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await User.find().select('-passwordHash').sort({ createdAt: -1 }).lean();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list users' });
  }
};

// POST /dev/users — Create a user
export const createUser = async (req: AuthRequest, res: Response): Promise<void> => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    res.status(400).json({ message: 'username, password, and role are required' });
    return;
  }
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, passwordHash, role });
    res.status(201).json({ _id: user._id, username: user.username, role: user.role });
  } catch (e: any) {
    if (e.code === 11000) { res.status(409).json({ message: 'Username already exists' }); return; }
    res.status(500).json({ message: 'Failed to create user' });
  }
};

// PUT /dev/users/:id — Update user role or password
export const updateUser = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { username, password, role } = req.body;
  try {
    const user = await User.findById(id);
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }
    if (username) user.username = username;
    if (role) user.role = role;
    if (password) user.passwordHash = await bcrypt.hash(password, 10);
    await user.save();
    res.json({ _id: user._id, username: user.username, role: user.role });
  } catch (e: any) {
    if (e.code === 11000) { res.status(409).json({ message: 'Username already exists' }); return; }
    res.status(500).json({ message: 'Failed to update user' });
  }
};

// DELETE /dev/users/:id
export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const user = await User.findById(id);
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }
    // Prevent deleting the last developer
    if (user.role === 'Developer') {
      const devCount = await User.countDocuments({ role: 'Developer' });
      if (devCount <= 1) {
        res.status(400).json({ message: 'Cannot delete the last Developer account' });
        return;
      }
    }
    await User.findByIdAndDelete(id);
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete user' });
  }
};

// ── Developer Portal: Retailer password management ───────────────────────────

// GET /dev/retailers — List all retailers with login info
export const listRetailersForDev = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const retailers = await Retailer.find().select('-__v').sort({ createdAt: -1 }).lean();
    const result = retailers.map(r => ({
      ...r,
      hasPassword: !!r.passwordHash,
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list retailers' });
  }
};

// PUT /dev/retailers/:id/password — Set/update retailer password
export const setRetailerPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { password } = req.body;
  if (!password) { res.status(400).json({ message: 'Password is required' }); return; }
  try {
    const retailer = await Retailer.findById(id);
    if (!retailer) { res.status(404).json({ message: 'Retailer not found' }); return; }
    retailer.passwordHash = await bcrypt.hash(password, 10);
    await retailer.save();
    res.json({ message: `Password set for ${retailer.name}` });
  } catch (error) {
    res.status(500).json({ message: 'Failed to set retailer password' });
  }
};

// ── Developer Portal: Clerk CRUD ─────────────────────────────────────────────

// GET /dev/clerks
export const listClerks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const clerks = await Clerk.find().select('-passwordHash').sort({ createdAt: -1 }).lean();
    res.json(clerks);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list clerks' });
  }
};

// POST /dev/clerks
export const createClerk = async (req: AuthRequest, res: Response): Promise<void> => {
  const { clerkId, name, retailerId, password } = req.body;
  if (!clerkId || !name || !retailerId || !password) {
    res.status(400).json({ message: 'clerkId, name, retailerId, and password are required' });
    return;
  }
  try {
    // Verify retailer exists
    const retailer = await Retailer.findOne({ retailerId });
    if (!retailer) { res.status(404).json({ message: 'Retailer not found' }); return; }
    const passwordHash = await bcrypt.hash(password, 10);
    const clerk = await Clerk.create({ clerkId, name, retailerId, passwordHash });
    res.status(201).json({ _id: clerk._id, clerkId: clerk.clerkId, name: clerk.name, retailerId: clerk.retailerId, status: clerk.status });
  } catch (e: any) {
    if (e.code === 11000) { res.status(409).json({ message: 'Clerk ID already exists' }); return; }
    res.status(500).json({ message: 'Failed to create clerk' });
  }
};

// PUT /dev/clerks/:id
export const updateClerk = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { name, password, status } = req.body;
  try {
    const clerk = await Clerk.findById(id);
    if (!clerk) { res.status(404).json({ message: 'Clerk not found' }); return; }
    if (name) clerk.name = name;
    if (status) clerk.status = status;
    if (password) clerk.passwordHash = await bcrypt.hash(password, 10);
    await clerk.save();
    res.json({ _id: clerk._id, clerkId: clerk.clerkId, name: clerk.name, retailerId: clerk.retailerId, status: clerk.status });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update clerk' });
  }
};

// DELETE /dev/clerks/:id
export const deleteClerk = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    await Clerk.findByIdAndDelete(id);
    res.json({ message: 'Clerk deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete clerk' });
  }
};
