// src/models/SmsPurchase.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface ISmsPurchase extends Document {
  schoolId: mongoose.Types.ObjectId;
  amount: number;         // naira
  credits: number;        // credits added
  reference: string;
  status: 'PENDING' | 'PAID' | 'FAILED';
  provider?: string;
  providerReference?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SmsPurchaseSchema = new Schema<ISmsPurchase>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    credits: { type: Number, required: true, min: 0 },
    reference: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED'],
      default: 'PAID',
    },
    provider: { type: String },
    providerReference: { type: String },
  },
  { timestamps: true }
);

SmsPurchaseSchema.index({ schoolId: 1, createdAt: -1 });

export const SmsPurchase = mongoose.model<ISmsPurchase>('SmsPurchase', SmsPurchaseSchema);
