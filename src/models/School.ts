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
  createdAt: Date;
  updatedAt: Date;
}

const SchoolSchema = new Schema<ISchool>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    logo: String,
    motto: String,
    address: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    website: String,
    country: { type: String, required: true },
    state: { type: String, required: true },
    city: { type: String, required: true },
    currency: { type: String, default: 'NGN' },
    timezone: { type: String, default: 'Africa/Lagos' },
    currentSession: String,
    currentTerm: String,
    status: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'],
      default: 'PENDING',
    },
    subscriptionId: String,
  },
  { timestamps: true }
);

export const School = mongoose.model<ISchool>('School', SchoolSchema);
