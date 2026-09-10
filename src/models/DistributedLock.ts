import mongoose, { Schema, Document } from 'mongoose';

// Replaces Redis's SET-NX-based lock (acquireLock/releaseLock). A unique
// index on `key` gives us the same atomicity guarantee: only one
// concurrent request can successfully insert a given lock key, so only
// one caller ever gets the lock, even under a race — same as Redis's
// `SET key val NX`.
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
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// TTL safety net: if a process crashes after acquiring a lock and never
// releases it, Mongo cleans it up automatically instead of it staying
// locked forever.
DistributedLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const DistributedLock = mongoose.model<IDistributedLock>('DistributedLock', DistributedLockSchema);
