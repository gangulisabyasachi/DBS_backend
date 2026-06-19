import mongoose from 'mongoose';
import crypto from 'crypto';
import dotenv from 'dotenv';
import Card from './models/Card';
import Quota from './models/Quota';
import Transaction from './models/Transaction';
import Retailer from './models/Retailer';

dotenv.config();

const CITIZENS = [
  { name: 'Rahul Sharma', id: 'CIT-001' },
  { name: 'Priya Menon', id: 'CIT-002' },
  { name: 'Anup Das', id: 'CIT-003' },
  { name: 'Meena Iyer', id: 'CIT-004' },
  { name: 'Suresh Kumar', id: 'CIT-005' },
  { name: 'Lakshmi Nair', id: 'CIT-006' },
  { name: 'Vikram Singh', id: 'CIT-007' },
  { name: 'Deepa Pillai', id: 'CIT-008' },
];

const STORES = [
  { name: 'MG Road Wines', address: '12 MG Road, Bengaluru', license: 'KA-LIC-2024-001' },
  { name: 'South Side Spirits', address: '45 Church St, Bengaluru', license: 'KA-LIC-2024-002' },
  { name: 'Central Depot', address: '7 Brigade Road, Bengaluru', license: 'KA-LIC-2024-003' },
];

const seedDB = async () => {
  await mongoose.connect(process.env.MONGO_URI as string);
  console.log('Connected. Seeding...');

  // Clear all
  await Promise.all([Card.deleteMany({}), Quota.deleteMany({}), Transaction.deleteMany({}), Retailer.deleteMany({})]);

  // Create Retailers
  const retailers = await Retailer.insertMany(
    STORES.map((s, i) => ({
      retailerId: `STORE-00${i + 1}`,
      name: s.name,
      address: s.address,
      licenseNumber: s.license,
      status: 'Active',
      apiKey: crypto.randomBytes(24).toString('hex'),
    }))
  );
  console.log(`✅ Created ${retailers.length} retailers`);

  // Create Cards + Quotas
  const cards = await Card.insertMany(
    CITIZENS.map((c, i) => ({
      cardholderId: c.id,
      cardholderName: c.name,
      status: i === 3 ? 'Suspended' : 'Active', // One suspended for realism
      type: ['NFC', 'QR', 'Smartcard'][i % 3],
    }))
  );

  const periodStart = new Date('2026-06-01T00:00:00Z');
  const periodEnd   = new Date('2026-06-30T23:59:59Z');

  const quotaSpent  = [42.5, 100, 15, 73, 0, 55, 88, 30];
  const quotas      = await Quota.insertMany(
    cards.map((c, i) => ({
      cardId: c._id,
      volumeAllocated: 100,
      volumeSpent: quotaSpent[i],
      periodStart,
      periodEnd,
    }))
  );
  console.log(`✅ Created ${cards.length} cards + ${quotas.length} quotas`);

  // Create realistic transactions
  const txns = [];
  const today = new Date();
  const statuses: Array<'Approved' | 'Denied'> = ['Approved', 'Approved', 'Approved', 'Denied'];

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const txDate = new Date(today);
    txDate.setDate(today.getDate() - dayOffset);

    for (let t = 0; t < (dayOffset === 0 ? 5 : 3); t++) {
      const cardIdx = Math.floor(Math.random() * cards.length);
      const retailerIdx = Math.floor(Math.random() * retailers.length);
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const volume = parseFloat((Math.random() * 4 + 0.5).toFixed(1));
      const ts = new Date(txDate);
      ts.setHours(8 + t * 2, Math.floor(Math.random() * 60));

      txns.push({
        txnId: crypto.randomUUID(),
        cardId: cards[cardIdx]._id,
        cardholderName: CITIZENS[cardIdx].name,
        retailerId: `STORE-00${retailerIdx + 1}`,
        retailerName: STORES[retailerIdx].name,
        volume,
        status,
        source: t % 3 === 0 ? 'Offline' : 'Online',
        timestamp: ts,
      });
    }
  }

  await Transaction.insertMany(txns);
  console.log(`✅ Created ${txns.length} transactions`);

  // Print card IDs for testing
  console.log('\n📋 TEST CARD IDs:');
  cards.forEach((c, i) => console.log(`  ${CITIZENS[i].id} (${CITIZENS[i].name}): ${c._id}`));

  process.exit(0);
};

seedDB().catch(e => { console.error(e); process.exit(1); });
