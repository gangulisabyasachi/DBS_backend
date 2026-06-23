import cron from 'node-cron';
import mongoose from 'mongoose';
import Card from '../models/Card';
import Quota from '../models/Quota';

export const startQuotaEngine = () => {
  console.log('🤖 Quota Engine Initialized. Running nightly sweeps at 00:00.');

  cron.schedule('0 0 * * *', async () => {
    console.log('🧹 [Quota Engine] Starting nightly sweep...');
    const session = await mongoose.startSession();
    
    try {
      const activeCards = await Card.find({ status: 'Active' });
      const now = new Date();
      let renewedCount = 0;

      for (const card of activeCards) {
        session.startTransaction();
        try {
          const currentQuota = await Quota.findOne({ cardId: card._id }).sort({ periodEnd: -1 });
          
          if (!currentQuota) {
            await session.commitTransaction();
            continue;
          }

          if (now > currentQuota.periodEnd) {
            const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            
            const existingNewQuota = await Quota.findOne({ cardId: card._id, periodStart });
            if (!existingNewQuota) {
              const newQuota = new Quota({
                cardId: card._id,
                volumeAllocated: currentQuota.volumeAllocated, // Carry over their allocation
                volumeSpent: 0,
                periodStart,
                periodEnd
              });
              await newQuota.save({ session });
              renewedCount++;
            }
          }
          await session.commitTransaction();
        } catch (error) {
          console.error(`Error processing card ${card._id}:`, error);
          await session.abortTransaction();
        }
      }
      
      console.log(`✅ [Quota Engine] Sweep complete. Renewed ${renewedCount} quotas for the new month.`);
    } catch (e) {
      console.error('❌ [Quota Engine] Fatal error during sweep:', e);
    } finally {
      session.endSession();
    }
  });
};
