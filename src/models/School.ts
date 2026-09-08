import mongoose, { Schema, Document } from 'mongoose';

export interface ISchool extends Document {
  name: string;
  slug: string;
  logo?: string;
  motto?: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  country: string;
  state: string;
  city: string;
  currency: string;
  timezone: string;
  currentSession?: string;
  currentTerm?: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  subscriptionId?: string;
  smsBalance: number;
  smsRate: number;
  smsMonthlyUsage: number;
  createdAt: Date;
  updatedAt: Date;
}

const SchoolSchema = new Schema<ISchool>(
  {
    name: { type: String, required: true },
    slug: { 
      type: String, 
      required: true, 
      unique: true,
      // Auto-generate slug from name if not provided
      set: function(this: any, val: string) {
        if (!val && this.name) {
          return this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        }
        return val;
      }
    },
    logo: String,
    motto: String,
    address: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    website: String,
    country: { type: String, default: 'Nigeria' },
    state: { type: String, default: '' },
    city: { type: String, default: '' },
    currency: { type: String, default: 'NGN' },
    timezone: { type: String, default: 'Africa/Lagos' },
    currentSession: String,
    currentTerm: String,
    status: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'],
      default: 'ACTIVE',
    },
    subscriptionId: String,
    smsBalance: { type: Number, default: 0 },
    smsRate: { type: Number, default: 2000 },
    smsMonthlyUsage: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Pre-save hook to ensure slug is set
SchoolSchema.pre('save', function(next) {
  if (!this.slug && this.name) {
    this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }
  next();
});

export const School = mongoose.model<ISchool>('School', SchoolSchema);
