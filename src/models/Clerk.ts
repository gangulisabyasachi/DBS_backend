import mongoose, { Schema, Document } from 'mongoose';

export interface IClerk extends Document {
  clerkId: string;
  name: string;
  retailerId: string;
  passwordHash: string;
  status: 'Active' | 'Inactive';
}

const ClerkSchema: Schema = new Schema({
  clerkId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  retailerId: { type: String, required: true },
  passwordHash: { type: String, required: true },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
}, { timestamps: true });

export default mongoose.model<IClerk>('Clerk', ClerkSchema);
