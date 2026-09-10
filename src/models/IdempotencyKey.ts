import mongoose, { Schema, Document } from 'mongoose';

// Replaces Redis `idempotency:{key}` entries. Stores the response body of
// a previously-handled request so a retried request with the same
// Idempotency-Key header can be answered from here instead of re-running
// the operation (important for payment/invoice endpoints).
export interface IIdempotencyKey extends Document {
  key: string;
  data: any;
  expiresAt: Date;
  createdAt: Date;
}

const IdempotencyKeySchema = new Schema<IIdempotencyKey>(
  {
    key: { type: String, required: true, unique: true, index: true },
    data: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

IdempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const IdempotencyKey = mongoose.model<IIdempotencyKey>('IdempotencyKey', IdempotencyKeySchema);
