import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import apiRoutes from './routes/api';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.use('/api/v1', apiRoutes);

app.get('/api/v1/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Add a default root route so the browser doesn't show a 404 error
app.get('/', (req, res) => {
  res.send('Digital Bratt System Backend is running securely! 🚀<br>API endpoints are available at /api/v1');
});

import { seedDev } from './controllers/authController';

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.warn("MONGO_URI is missing. Server running without DB connection. Add it to .env once generated.");
      return;
    }
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB Replica Set (Ready for ACID Transactions)');
    await seedDev(); // Seed default developer if missing
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
};

app.listen(PORT, async () => {
  await connectDB();
  console.log(`🚀 Central Server running on http://localhost:${PORT}`);
});
