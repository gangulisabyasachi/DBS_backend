import mongoose, { Schema, Document } from 'mongoose';

export interface IRetailer extends Document {
  retailerId: string;
  name: string;
  address: string;
  licenseNumber: string;
  status: 'Active' | 'Suspended' | 'Revoked';
  apiKey: string;
  passwordHash: string;
  location?: { lat: number; lng: number };
}

const RetailerSchema: Schema = new Schema({
  retailerId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  address: { type: String, required: true },
  licenseNumber: { type: String, required: true, unique: true },
  status: { type: String, enum: ['Active', 'Suspended', 'Revoked'], default: 'Active' },
  apiKey: { type: String, required: true },
  passwordHash: { type: String, default: '' },
  location: {
    lat: { type: Number },
    lng: { type: Number }
  }
}, { timestamps: true });

export default mongoose.model<IRetailer>('Retailer', RetailerSchema);
