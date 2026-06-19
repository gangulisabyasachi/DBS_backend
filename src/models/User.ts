import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  passwordHash: string;
  role: 'Admin' | 'Auditor' | 'Clerk' | 'Developer';
}

const UserSchema: Schema = new Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['Admin', 'Auditor', 'Clerk', 'Developer'], required: true },
}, { timestamps: true });

export default mongoose.model<IUser>('User', UserSchema);
