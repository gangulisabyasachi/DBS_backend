import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Retailer from './src/models/Retailer';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

const locations = [
  { id: 'STORE-001', name: 'Kolkata Shop', lat: 22.5726, lng: 88.3639 },
  { id: 'STORE-002', name: 'Delhi Shop', lat: 28.7041, lng: 77.1025 },
  { id: 'STORE-003', name: 'Hyderabad Shop', lat: 17.3850, lng: 78.4867 },
  { id: 'STORE-004', name: 'Mumbai Shop', lat: 19.0760, lng: 72.8777 },
  { id: 'STORE-005', name: 'Chennai Shop', lat: 13.0827, lng: 80.2707 },
];

const seedLocations = async () => {
  if (!MONGO_URI) {
    console.error('MONGO_URI is missing');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  for (const loc of locations) {
    const r = await Retailer.findOne({ retailerId: loc.id });
    if (r) {
      r.name = loc.name;
      r.location = { lat: loc.lat, lng: loc.lng };
      await r.save();
      console.log(`✅ Updated ${loc.id} to ${loc.name} with coordinates`);
    } else {
      console.log(`⚠️ ${loc.id} not found`);
    }
  }

  console.log('Seeding complete.');
  process.exit(0);
};

seedLocations().catch(err => {
  console.error(err);
  process.exit(1);
});
