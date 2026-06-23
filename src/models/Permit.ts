import mongoose, { Document, Schema } from 'mongoose';

export interface IPermit extends Document {
  cardId: mongoose.Types.ObjectId;
  cardholderName: string;
  reason: string;
  requestedVolume: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
}

const PermitSchema: Schema = new Schema({
  cardId: { type: Schema.Types.ObjectId, ref: 'Card', required: true },
  cardholderName: { type: String, required: true },
  reason: { type: String, required: true },
  requestedVolume: { type: Number, required: true },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  createdAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date },
  resolvedBy: { type: String }
});

export default mongoose.model<IPermit>('Permit', PermitSchema);
