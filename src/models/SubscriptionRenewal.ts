import mongoose, { Schema, Document } from 'mongoose';

export interface ISubscriptionRenewal extends Document {
  schoolId: mongoose.Types.ObjectId;
  subscriptionId: mongoose.Types.ObjectId;
  plan: string;
  amount: number; // in kobo
  proofUrl?: string;
  reference: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionRenewalSchema = new Schema<ISubscriptionRenewal>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', required: true },
    plan: { type: String, required: true },
    amount: { type: Number, required: true },
    proofUrl: { type: String },
    reference: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    submittedAt: { type: Date, default: Date.now },
    reviewedAt: Date,
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: String,
  },
  { timestamps: true }
);

export const SubscriptionRenewal = mongoose.model<ISubscriptionRenewal>(
  'SubscriptionRenewal',
  SubscriptionRenewalSchema
);
