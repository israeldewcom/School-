import Redis from 'ioredis';
import logger from './logger';
import { env } from './env';

let client: Redis;
let redisReady = false;

export const getRedisClient = (): Redis => {
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      lazyConnect: false,
      tls: {
        rejectUnauthorized: false,
      },
    });

    client.on('connect', () => {
      logger.info('Redis connected');
      redisReady = true;
    });
    client.on('error', (err) => {
      logger.error('Redis error:', err.message);
      redisReady = false;
      // Attempt reconnection after 5 seconds
      setTimeout(() => client.connect().catch(() => {}), 5000);
    });
    client.on('close', () => {
      logger.warn('Redis connection closed');
      redisReady = false;
    });
    client.on('ready', () => {
      logger.info('Redis ready');
      redisReady = true;
    });
  }
  return client;
};

export const redis = getRedisClient();

// Wrappers that safely handle cases where Redis is down
const safeRedis = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  if (!redisReady) {
    logger.warn('Redis not ready, using fallback');
    return fallback;
  }
  try {
    return await fn();
  } catch (error) {
    logger.error('Redis operation failed:', error);
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
