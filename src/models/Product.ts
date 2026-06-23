import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
  sku: string;
  name: string;
  category: 'Whiskey' | 'Vodka' | 'Rum' | 'Beer' | 'Wine' | 'Other';
  volumeLiters: number;
}

const ProductSchema: Schema = new Schema({
  sku: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  category: { type: String, enum: ['Whiskey', 'Vodka', 'Rum', 'Beer', 'Wine', 'Other'], required: true },
  volumeLiters: { type: Number, required: true },
}, { timestamps: true });

export default mongoose.model<IProduct>('Product', ProductSchema);
