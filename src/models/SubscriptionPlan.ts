import mongoose, { Schema, Document } from 'mongoose';

export interface ISubscriptionPlan extends Document {
  name: string;
  description?: string;
  price: number; // kobo per billing cycle
  currency: string;
  billingCycle: 'MONTHLY' | 'TERMLY' | 'ANNUAL';
  entitlements: {
    maxStudents: number;
    maxStaff: number;
    storageGB: number;
    smsMonthly: number;
    customReportCards: boolean;
    analytics: boolean;
    parentPortal: boolean;
    apiAccess: boolean;
    multiCampus: boolean;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionPlanSchema = new Schema<ISubscriptionPlan>(
  {
    name: { type: String, required: true },
    description: String,
    price: { type: Number, required: true },
    currency: { type: String, default: 'NGN' },
    billingCycle: {
      type: String,
      enum: ['MONTHLY', 'TERMLY', 'ANNUAL'],
      default: 'TERMLY',
    },
    entitlements: {
      maxStudents: { type: Number, required: true },
      maxStaff: { type: Number, required: true },
      storageGB: { type: Number, required: true },
      smsMonthly: { type: Number, required: true },
      customReportCards: { type: Boolean, default: false },
      analytics: { type: Boolean, default: false },
      parentPortal: { type: Boolean, default: false },
      apiAccess: { type: Boolean, default: false },
      multiCampus: { type: Boolean, default: false },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const SubscriptionPlan = mongoose.model<ISubscriptionPlan>(
  'SubscriptionPlan',
  SubscriptionPlanSchema
);
