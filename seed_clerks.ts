import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Retailer from './src/models/Retailer';
import Clerk from './src/models/Clerk';
import bcrypt from 'bcryptjs';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

const seedClerks = async () => {
  if (!MONGO_URI) {
    console.error('MONGO_URI is missing');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const retailers = await Retailer.find();
  console.log(`Found ${retailers.length} retailers.`);

  const passwordHash = await bcrypt.hash('password123', 10);

  for (const retailer of retailers) {
    // Check if clerks already exist for this retailer
    const existingClerks = await Clerk.find({ retailerId: retailer.retailerId });
    if (existingClerks.length > 0) {
      console.log(`Retailer ${retailer.name} (${retailer.retailerId}) already has ${existingClerks.length} clerks.`);
      continue;
    }

    // Add 2 clerks for each retailer
    const clerk1 = {
      clerkId: `CLK-${retailer.retailerId}-1`,
      name: `${retailer.name} Clerk 1`,
      retailerId: retailer.retailerId,
      passwordHash,
      status: 'Active'
    };

    const clerk2 = {
      clerkId: `CLK-${retailer.retailerId}-2`,
      name: `${retailer.name} Clerk 2`,
      retailerId: retailer.retailerId,
      passwordHash,
      status: 'Active'
    };

    await Clerk.insertMany([clerk1, clerk2]);
    console.log(`✅ Added 2 clerks to ${retailer.name} (${retailer.retailerId})`);
  }

  console.log('Seeding complete.');
  process.exit(0);
};

seedClerks().catch(err => {
  console.error(err);
  process.exit(1);
});
