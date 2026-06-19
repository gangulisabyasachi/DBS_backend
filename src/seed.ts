import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Card from './models/Card';
import Quota from './models/Quota';

dotenv.config();

const seedDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('Connected to DB for seeding...');

    // Clear existing
    await Card.deleteMany({});
    await Quota.deleteMany({});

    // Create a Test Card
    const card = new Card({
      cardholderId: 'CITIZEN-001',
      status: 'Active',
      type: 'NFC'
    });
    await card.save();

    // Create a Quota for this Card (100 Litres allocated)
    const quota = new Quota({
      cardId: card._id,
      volumeAllocated: 100,
      volumeSpent: 0,
      periodStart: new Date('2026-06-01T00:00:00Z'),
      periodEnd: new Date('2026-06-30T23:59:59Z'),
    });
    await quota.save();

    console.log('✅ Seeding complete!');
    console.log(`TEST CARD ID: ${card._id}`);
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

seedDB();
