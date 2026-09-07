import Redis from 'ioredis';
import logger from './config/logger'; // adjust path if needed
import { env } from './env';

let client: Redis;

const getRedisClient = (): Redis => {
  if (!client) {
    const url = env.REDIS_URL;
    if (!url) {
      logger.warn('REDIS_URL not set – Redis features disabled');
      // Return a dummy client that does nothing
      return new Redis({ lazyConnect: true });
    }

    client = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectTimeout: 10000,
      retryStrategy: (times) => {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s... up to 60s
        const delay = Math.min(Math.pow(2, times) * 1000, 60000);
        logger.warn(`Redis reconnect attempt ${times} in ${delay}ms`);
        return delay;
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    // Suppress repeated error logs (only log once per error type)
    let lastErrorTime = 0;
    client.on('error', (err) => {
      const now = Date.now();
      if (now - lastErrorTime > 30000) { // log at most once per 30s
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

// Wrappers that silently fail if Redis is down
const safeRedis = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  if (!redis.status || redis.status === 'end' || redis.status === 'close') {
    return fallback;
  }
  try {
    return await fn();
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
