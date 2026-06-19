import mongoose, { Schema, Document } from 'mongoose';

export interface IQuota extends Document {
  cardId: mongoose.Types.ObjectId;
  volumeAllocated: number;
  volumeSpent: number;
  periodStart: Date;
  periodEnd: Date;
}

const QuotaSchema: Schema = new Schema({
  cardId: { type: Schema.Types.ObjectId, ref: 'Card', required: true },
  volumeAllocated: { type: Number, required: true },
  volumeSpent: { type: Number, default: 0 },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
}, { timestamps: true });

// Ensures rapid lookup and one quota per period per card
QuotaSchema.index({ cardId: 1, periodStart: 1 }, { unique: true });

export default mongoose.model<IQuota>('Quota', QuotaSchema);
