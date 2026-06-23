import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Retailer from './src/models/Retailer';
import Product from './src/models/Product';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

const products = [
  { sku: 'BEER-500', name: 'Craft Beer 500ml', category: 'Beer', volumeLiters: 0.5 },
  { sku: 'WHISK-750', name: 'Premium Whiskey 750ml', category: 'Whiskey', volumeLiters: 0.75 },
  { sku: 'VODKA-1000', name: 'Classic Vodka 1L', category: 'Vodka', volumeLiters: 1.0 },
  { sku: 'RUM-750', name: 'Dark Rum 750ml', category: 'Rum', volumeLiters: 0.75 },
  { sku: 'WINE-750', name: 'Red Wine 750ml', category: 'Wine', volumeLiters: 0.75 },
];

const seedInventory = async () => {
  if (!MONGO_URI) {
    console.error('MONGO_URI is missing');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  // Seed Products
  for (const p of products) {
    await Product.updateOne({ sku: p.sku }, { $set: p }, { upsert: true });
  }
  console.log('✅ Products seeded.');

  // Seed Retailer Inventory
  const retailers = await Retailer.find();
  for (const r of retailers) {
    // Generate random stock between 10 and 100 for each product
    const inventory = products.map(p => ({
      sku: p.sku,
      stock: Math.floor(Math.random() * 90) + 10
    }));
    
    r.inventory = inventory;
    await r.save();
    console.log(`✅ Seeded inventory for ${r.name}`);
  }

  console.log('Seeding complete.');
  process.exit(0);
};

seedInventory().catch(err => {
  console.error(err);
  process.exit(1);
});
