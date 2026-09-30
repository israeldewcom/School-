import mongoose, { Schema, Document } from 'mongoose';

export interface IPendingRenewal {
  reference: string;
  planName?: string | null;
  date?: Date;
  proof?: string | null;
  submittedAt: Date;
  submittedBy?: mongoose.Types.ObjectId;
}

export interface IRenewalHistory {
  reference: string;
  planName?: string | null;
  submittedAt?: Date;
  decision: 'APPROVED' | 'REJECTED';
  decidedAt: Date;
  decidedBy?: mongoose.Types.ObjectId;
  reason?: string;
  daysAdded?: number;
}

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
  // Trial fields
  isTrial: boolean;
  trialEndDate?: Date;
  // Renewal workflow. Previously these were assigned on the document but
  // missing from the schema, so Mongoose silently dropped them and no
  // renewal request was ever saved.
  pendingRenewal?: IPendingRenewal;
  renewalHistory: IRenewalHistory[];
  createdAt: Date;
  updatedAt: Date;
}

const PendingRenewalSchema = new Schema<IPendingRenewal>(
  {
    reference: { type: String, required: true, trim: true },
    planName: { type: String, default: null },
    date: { type: Date },
    proof: { type: String, default: null },
    submittedAt: { type: Date, default: Date.now },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const RenewalHistorySchema = new Schema<IRenewalHistory>(
  {
    reference: { type: String, required: true },
    planName: { type: String, default: null },
    submittedAt: { type: Date },
    decision: { type: String, enum: ['APPROVED', 'REJECTED'], required: true },
    decidedAt: { type: Date, required: true },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String },
    daysAdded: { type: Number },
  },
  { _id: false }
);

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
    isTrial: { type: Boolean, default: false },
    trialEndDate: { type: Date },
    pendingRenewal: { type: PendingRenewalSchema, default: undefined },
    renewalHistory: { type: [RenewalHistorySchema], default: [] },
  },
  { timestamps: true }
);

SubscriptionSchema.index({ 'pendingRenewal.submittedAt': 1 }, { sparse: true });

export const Subscription = mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
