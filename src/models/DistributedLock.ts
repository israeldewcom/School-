import mongoose, { Schema, Document } from 'mongoose';

export interface IDistributedLock extends Document {
  key: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

const DistributedLockSchema = new Schema<IDistributedLock>(
  {
    key: { type: String, required: true, unique: true },
    token: { type: String, required: true },
    // TTL index target — was missing before, so locks never expired.
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

DistributedLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const DistributedLock = mongoose.model<IDistributedLock>(
  'DistributedLock',
  DistributedLockSchema
);
