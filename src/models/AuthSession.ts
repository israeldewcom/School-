import mongoose, { Schema, Document } from 'mongoose';

// Login/auth session store — replaces the old Redis `session:{id}` keys.
// A session is created on login/refresh and deleted on logout. The TTL
// index below makes Mongo auto-delete expired docs, mirroring Redis's
// `EX` behaviour, so no separate cleanup job is needed.
export interface IAuthSession extends Document {
  sessionId: string;
  userId: mongoose.Types.ObjectId;
  schoolId?: string;
  ip?: string;
  userAgent?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AuthSessionSchema = new Schema<IAuthSession>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    schoolId: { type: String },
    ip: { type: String },
    userAgent: { type: String },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// TTL index: MongoDB's background task sweeps documents once `expiresAt`
// is in the past. expireAfterSeconds: 0 means "delete at expiresAt itself".
AuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthSession = mongoose.model<IAuthSession>('AuthSession', AuthSessionSchema);
