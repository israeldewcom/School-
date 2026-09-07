import mongoose, { Schema, Document } from 'mongoose';

export interface ISubscription extends Document {
  schoolId: mongoose.Types.ObjectId;
  planId: mongoose.Types.ObjectId;
  status: 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'PAST_DUE';
  startDate: Date;
  endDate: Date;
  autoRenew: boolean;
  paymentMethod?: string;
  priceAtPurchase: number;
  billingCycleAtPurchase: 'MONTHLY' | 'TERMLY' | 'ANNUAL';
  durationDaysAtPurchase: number;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    planId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'CANCELLED', 'EXPIRED', 'PAST_DUE'],
      default: 'ACTIVE',
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    autoRenew: { type: Boolean, default: true },
    paymentMethod: String,
    priceAtPurchase: { type: Number, required: true },
    billingCycleAtPurchase: {
      type: String,
      enum: ['MONTHLY', 'TERMLY', 'ANNUAL'],
      required: true,
    },
    durationDaysAtPurchase: { type: Number, required: true },
  },
  { timestamps: true }
);

export const Subscription = mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
