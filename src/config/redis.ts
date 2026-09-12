import Redis from 'ioredis';
import logger from './logger';
import { env } from './env';

// ============================================================================
// MAIN APP CLIENT — fast-fail, no offline queue
// ============================================================================
// Used for caching, distributed locks, and idempotency checks. Configured
// with a finite maxRetriesPerRequest and no offline queue so a down Redis
// causes an immediate fallback instead of a hanging HTTP request.

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
      maxRetriesPerRequest: 3,
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
    client.on('connect', () => logger.info('Redis connected'));
    client.on('ready', () => logger.info('Redis ready'));
    client.on('close', () => logger.warn('Redis connection closed'));
  }
  return client;
};

export const redis = getRedisClient();

// ============================================================================
// BULLMQ CLIENT — must have maxRetriesPerRequest: null
// ============================================================================
// BullMQ uses blocking commands (BRPOPLPUSH etc.) that need to wait
// indefinitely on the server. Its Worker constructor enforces this by
// throwing at startup if maxRetriesPerRequest is anything other than null.
// We therefore use a separate, dedicated connection for Queue and Worker
// instances.
//
// The "hang forever" problem this could reintroduce at the app level is
// mitigated by safeQueueAdd() (jobs/queues.ts), which races queue.add()
// against a 3-second timeout so HTTP requests always return.
//
// enableOfflineQueue stays at the default (true) because BullMQ's own
// reconnect logic depends on it.

let bullClient: Redis | null = null;

const getBullRedisClient = (): Redis => {
  if (!bullClient) {
    const url = env.REDIS_URL;
    if (!url) {
      logger.warn('REDIS_URL not set – BullMQ features disabled');
      bullClient = new Redis({ lazyConnect: true, maxRetriesPerRequest: null });
      return bullClient;
    }

    const isTls = url.startsWith('rediss://');
    let host: string | undefined;
    try {
      host = new URL(url).hostname;
    } catch (_) {
      host = undefined;
    }

    bullClient = new Redis(url, {
      // 🔴 Required by BullMQ — do not change this to a number.
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectTimeout: 10000,
      retryStrategy: (times) => {
        const delay = Math.min(Math.pow(2, times) * 1000, 60000);
        if (times % 10 === 0) {
          logger.warn(`BullMQ Redis reconnect attempt ${times} in ${delay}ms`);
        }
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
    bullClient.on('error', (err) => {
      const now = Date.now();
      if (now - lastErrorTime > 30000) {
        logger.error('BullMQ Redis error:', err.message);
        lastErrorTime = now;
      }
    });
    bullClient.on('connect', () => logger.info('BullMQ Redis connected'));
    bullClient.on('ready', () => logger.info('BullMQ Redis ready'));
    bullClient.on('close', () => logger.warn('BullMQ Redis connection closed'));
  }
  return bullClient;
};

export const redisForBullMQ = getBullRedisClient();

// ============================================================================
// SAFE WRAPPERS — used only by the main app client
// ============================================================================

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
