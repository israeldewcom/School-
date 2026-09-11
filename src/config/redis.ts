import Redis from 'ioredis';
import logger from './logger';
import { env } from './env';

let client: Redis;

const getRedisClient = (): Redis => {
  if (!client) {
    const url = env.REDIS_URL;
    if (!url) {
      logger.warn('REDIS_URL not set – Redis features disabled');
      return new Redis({ lazyConnect: true });
    }

    const isTls = url.startsWith('rediss://');
    let host: string | undefined;
    try {
      host = new URL(url).hostname;
    } catch (_) {
      host = undefined;
    }

    client = new Redis(url, {
      // 🔴 FIX #1: was `null`, which queues commands forever when Redis is
      // unreachable. With a finite value, ioredis rejects after 3 retries
      // and the caller can fall back gracefully.
      maxRetriesPerRequest: 3,

      // 🔴 FIX #2: fail immediately if the connection isn't ready instead of
      // buffering the command in the offline queue. This is what stops
      // HTTP requests from hanging forever when Redis is down.
      enableOfflineQueue: false,

      enableReadyCheck: false,
      connectTimeout: 5000,
      retryStrategy: (times) => {
        const delay = Math.min(Math.pow(2, times) * 1000, 60000);
        logger.warn(`Redis reconnect attempt ${times} in ${delay}ms`);
        return delay;
      },
      ...(isTls
        ? {
            tls: {
              rejectUnauthorized: false,
              servername: host,
            },
          }
        : {}),
    });

    let lastErrorTime = 0;
    client.on('error', (err) => {
      const now = Date.now();
      if (now - lastErrorTime > 30000) {
        logger.error('Redis error:', err.message);
        lastErrorTime = now;
      }
    });

    client.on('connect', () => {
      logger.info('Redis connected');
    });

    client.on('ready', () => {
      logger.info('Redis ready');
    });

    client.on('close', () => {
      logger.warn('Redis connection closed');
    });
  }
  return client;
};

export const redis = getRedisClient();

// Kept for compatibility with any existing callers. The safeRedis wrapper
// now relies on the client's own fast-fail behavior, so the timeout race
// is a belt-and-braces second layer.
const REDIS_OP_TIMEOUT_MS = 1500;

const safeRedis = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  if (!redis.status || redis.status === 'end' || redis.status === 'close') {
    return fallback;
  }
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((resolve) => {
        setTimeout(() => resolve(fallback), REDIS_OP_TIMEOUT_MS);
      }),
    ]);
  } catch (_) {
    return fallback;
  }
};

export const setJSON = async (key: string, value: any, ttl?: number): Promise<void> => {
  await safeRedis(async () => {
    const serialized = JSON.stringify(value);
    if (ttl) {
      await redis.set(key, serialized, 'EX', ttl);
    } else {
      await redis.set(key, serialized);
    }
  }, undefined);
};

export const getJSON = async <T>(key: string): Promise<T | null> => {
  return safeRedis(async () => {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }, null);
};

export const del = async (key: string): Promise<void> => {
  await safeRedis(async () => {
    await redis.del(key);
  }, undefined);
};

export const acquireLock = async (key: string, ttlSeconds: number): Promise<string | null> => {
  return safeRedis(async () => {
    const token = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const result = await redis.set(key, token, 'EX', ttlSeconds, 'NX');
    return result === 'OK' ? token : null;
  }, null);
};

export const releaseLock = async (key: string, token: string): Promise<boolean> => {
  return safeRedis(async () => {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await redis.eval(script, 1, key, token);
    return result === 1;
  }, false);
};

export const setIdempotency = async (key: string, result: any, ttl?: number): Promise<void> => {
  await setJSON(`idempotency:${key}`, result, ttl || env.IDEMPOTENCY_TTL);
};

export const getIdempotency = async <T>(key: string): Promise<T | null> => {
  return getJSON<T>(`idempotency:${key}`);
};

export const safeRedisCall = safeRedis;
