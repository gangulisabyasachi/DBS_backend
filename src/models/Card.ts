import mongoose, { Schema, Document } from 'mongoose';

export interface ICard extends Document {
  cardholderId: string;
  cardholderName: string;
  status: 'Active' | 'Inactive' | 'Suspended' | 'Revoked';
  type: 'NFC' | 'QR' | 'Smartcard';
}

const CardSchema: Schema = new Schema({
  cardholderId: { type: String, required: true },
  cardholderName: { type: String, required: true },
  status: { type: String, enum: ['Active', 'Inactive', 'Suspended', 'Revoked'], default: 'Active' },
  type: { type: String, enum: ['NFC', 'QR', 'Smartcard'], required: true },
}, { timestamps: true });

export default mongoose.model<ICard>('Card', CardSchema);
