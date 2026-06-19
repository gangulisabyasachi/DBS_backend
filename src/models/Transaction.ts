import mongoose, { Schema, Document } from 'mongoose';

export interface ITransaction extends Document {
  txnId: string;
  cardId: mongoose.Types.ObjectId;
  cardholderName: string;
  retailerId: string;
  retailerName: string;
  volume: number;
  status: 'Approved' | 'Denied' | 'Pending' | 'Synced' | 'Rejected';
  source: 'Online' | 'Offline';
  timestamp: Date;
}

const TransactionSchema: Schema = new Schema({
  txnId: { type: String, required: true, unique: true },
  cardId: { type: Schema.Types.ObjectId, ref: 'Card', required: true },
  cardholderName: { type: String, default: '' },
  retailerId: { type: String, required: true },
  retailerName: { type: String, default: '' },
  volume: { type: Number, required: true },
  status: { type: String, enum: ['Approved', 'Denied', 'Pending', 'Synced', 'Rejected'], required: true },
  source: { type: String, enum: ['Online', 'Offline'], required: true },
  timestamp: { type: Date, required: true },
}, { timestamps: true });

TransactionSchema.index({ timestamp: -1 });
TransactionSchema.index({ retailerId: 1, timestamp: -1 });

export default mongoose.model<ITransaction>('Transaction', TransactionSchema);
