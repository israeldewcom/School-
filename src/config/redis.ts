import Redis from 'ioredis';
import logger from './logger';
import { env } from './env';

let client: Redis;

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

    client.on('connect', () => logger.info('Redis connected'));
    client.on('error', (err) => logger.error('Redis error:', err));
    client.on('close', () => logger.warn('Redis connection closed'));
    client.on('ready', () => logger.info('Redis ready'));
  }
  return client;
};

export const redis = getRedisClient();

export const setJSON = async (key: string, value: any, ttl?: number): Promise<void> => {
  const serialized = JSON.stringify(value);
  if (ttl) {
    await redis.set(key, serialized, 'EX', ttl);
  } else {
    await redis.set(key, serialized);
  }
};

export const getJSON = async <T>(key: string): Promise<T | null> => {
  const data = await redis.get(key);
  if (!data) return null;
  return JSON.parse(data);
};

export const del = async (key: string): Promise<void> => {
  await redis.del(key);
};

export const acquireLock = async (key: string, ttlSeconds: number): Promise<string | null> => {
  const token = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const result = await redis.set(key, token, 'EX', ttlSeconds, 'NX');
  if (result === 'OK') return token;
  return null;
};

export const releaseLock = async (key: string, token: string): Promise<boolean> => {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  const result = await redis.eval(script, 1, key, token);
  return result === 1;
};

export const setIdempotency = async (key: string, result: any, ttl?: number): Promise<void> => {
  await setJSON(`idempotency:${key}`, result, ttl || env.IDEMPOTENCY_TTL);
};

export const getIdempotency = async <T>(key: string): Promise<T | null> => {
  return getJSON<T>(`idempotency:${key}`);
};
