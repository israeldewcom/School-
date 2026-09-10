import { AuthSession } from '../models/AuthSession';
import { IdempotencyKey } from '../models/IdempotencyKey';
import { DistributedLock } from '../models/DistributedLock';
import { env } from './env';
import logger from './logger';

// ============================================================================
// Replaces src/config/redis.ts. Sessions, idempotency keys, and locks all
// now live in MongoDB instead of Redis, so there's no second datastore that
// can silently go dark and take auth down with it (see: the "Session
// expired" bug this replaced). Function names/signatures match the old
// Redis-backed helpers as closely as possible so callers changed minimally.
// ============================================================================

const addSeconds = (seconds: number): Date => new Date(Date.now() + seconds * 1000);

// ---- Sessions --------------------------------------------------------------

export interface SessionData {
  userId: string;
  schoolId?: string;
  ip?: string;
  userAgent?: string;
  createdAt?: string;
}

export const setSession = async (
  sessionId: string,
  data: SessionData,
  ttlSeconds: number
): Promise<void> => {
  await AuthSession.findOneAndUpdate(
    { sessionId },
    {
      sessionId,
      userId: data.userId,
      schoolId: data.schoolId,
      ip: data.ip,
      userAgent: data.userAgent,
      expiresAt: addSeconds(ttlSeconds),
    },
    { upsert: true, new: true }
  );
};

export const getSession = async (sessionId: string): Promise<SessionData | null> => {
  const doc = await AuthSession.findOne({ sessionId, expiresAt: { $gt: new Date() } });
  if (!doc) return null;
  return {
    userId: doc.userId.toString(),
    schoolId: doc.schoolId,
    ip: doc.ip,
    userAgent: doc.userAgent,
  };
};

export const deleteSession = async (sessionId: string): Promise<void> => {
  await AuthSession.deleteOne({ sessionId });
};

export const getUserSessionIds = async (userId: string): Promise<string[]> => {
  const docs = await AuthSession.find({ userId }).select('sessionId').lean();
  return docs.map((d) => d.sessionId);
};

export const deleteAllUserSessions = async (userId: string): Promise<void> => {
  await AuthSession.deleteMany({ userId });
};

// ---- Idempotency keys --------------------------------------------------------

export const setIdempotency = async (key: string, result: any, ttl?: number): Promise<void> => {
  const ttlSeconds = ttl || env.IDEMPOTENCY_TTL;
  await IdempotencyKey.findOneAndUpdate(
    { key },
    { key, data: result, expiresAt: addSeconds(ttlSeconds) },
    { upsert: true, new: true }
  );
};

export const getIdempotency = async <T>(key: string): Promise<T | null> => {
  const doc = await IdempotencyKey.findOne({ key, expiresAt: { $gt: new Date() } });
  return doc ? (doc.data as T) : null;
};

// ---- Distributed lock (payment processing, etc.) ---------------------------
//
// Atomicity comes from the unique index on `key` in DistributedLock: if two
// requests race to acquire the same lock, only one insert can succeed —
// Mongo rejects the second with a duplicate-key error, which we treat as
// "lock not acquired". This is the same guarantee Redis's `SET key val NX`
// gave us.

export const acquireLock = async (key: string, ttlSeconds: number): Promise<string | null> => {
  const token = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  try {
    await DistributedLock.create({ key, token, expiresAt: addSeconds(ttlSeconds) });
    return token;
  } catch (err: any) {
    if (err?.code === 11000) {
      // Someone else holds the lock. If their lock has actually expired
      // (e.g. they crashed before releasing it) but the TTL sweep hasn't
      // run yet, steal it — otherwise a crashed holder locks this key
      // forever until the background sweep catches up.
      const existing = await DistributedLock.findOne({ key });
      if (existing && existing.expiresAt.getTime() < Date.now()) {
        const stolen = await DistributedLock.findOneAndUpdate(
          { key, token: existing.token },
          { token, expiresAt: addSeconds(ttlSeconds) },
          { new: true }
        );
        return stolen ? token : null;
      }
      return null;
    }
    logger.error('acquireLock failed:', err?.message);
    return null;
  }
};

export const releaseLock = async (key: string, token: string): Promise<boolean> => {
  const result = await DistributedLock.deleteOne({ key, token });
  return result.deletedCount === 1;
};

// ---- Generic JSON get/set ----------------------------------------------------
// A handful of callers (permission cache, subscription cache) used the raw
// getJSON/setJSON helpers with ad-hoc key prefixes rather than a dedicated
// model. Since these are pure caches (safe to miss, not safe-critical like
// sessions/locks), we back them with a small generic collection rather than
// adding a model per cache type.

import mongoose, { Schema } from 'mongoose';

const CacheEntrySchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed },
    expiresAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
CacheEntrySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const CacheEntry = mongoose.models.CacheEntry || mongoose.model('CacheEntry', CacheEntrySchema);

export const setJSON = async (key: string, value: any, ttl?: number): Promise<void> => {
  try {
    await CacheEntry.findOneAndUpdate(
      { key },
      { key, value, expiresAt: ttl ? addSeconds(ttl) : undefined },
      { upsert: true, new: true }
    );
  } catch (err: any) {
    logger.error(`setJSON(${key}) failed:`, err?.message);
  }
};

export const getJSON = async <T>(key: string): Promise<T | null> => {
  try {
    const doc: any = await CacheEntry.findOne({
      key,
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
    });
    return doc ? (doc.value as T) : null;
  } catch (err: any) {
    logger.error(`getJSON(${key}) failed:`, err?.message);
    return null;
  }
};

export const del = async (key: string): Promise<void> => {
  await CacheEntry.deleteOne({ key });
};
