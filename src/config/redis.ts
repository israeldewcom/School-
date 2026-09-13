// src/config/redis.ts
import Redis, { RedisOptions } from 'ioredis';
import logger from './logger';

const REDIS_URL = process.env.REDIS_URL;
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const REDIS_TLS = process.env.REDIS_TLS === 'true';
const REDIS_DB = Number(process.env.REDIS_DB) || 0;

const isProduction = process.env.NODE_ENV === 'production';

const baseOptions: RedisOptions = {
  retryStrategy(times: number) {
    const delay = Math.min(times * 200, 30000);
    return delay;
  },
  maxRetriesPerRequest: isProduction ? 3 : null,
  enableOfflineQueue: !isProduction,
  enableReadyCheck: true,
  lazyConnect: false,
  connectionName: 'schoolflow-api',
};

// Main application client — caching, rate limits, health pings.
export const redis = REDIS_URL
  ? new Redis(REDIS_URL, {
      ...baseOptions,
      ...(REDIS_TLS ? { tls: { rejectUnauthorized: false } } : {}),
    })
  : new Redis({
      ...baseOptions,
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      db: REDIS_DB,
      ...(REDIS_TLS ? { tls: { rejectUnauthorized: false } } : {}),
    });

// BullMQ client — must have maxRetriesPerRequest: null for blocking
// commands. Also gets its own connection so a slow job can't stall
// the app's cache traffic.
export const bullmqConnection = REDIS_URL
  ? new Redis(REDIS_URL, {
      ...baseOptions,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      connectionName: 'schoolflow-worker',
      ...(REDIS_TLS ? { tls: { rejectUnauthorized: false } } : {}),
    })
  : new Redis({
      ...baseOptions,
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      db: REDIS_DB,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      connectionName: 'schoolflow-worker',
      ...(REDIS_TLS ? { tls: { rejectUnauthorized: false } } : {}),
    });

// ------------------------------------------------------------------
// Aliases — the codebase had a prior name for the BullMQ connection.
// Both `bullmqConnection` and `redisForBullMQ` refer to the same
// instance. New code should prefer `bullmqConnection`; the alias
// exists so existing imports keep compiling.
// ------------------------------------------------------------------
export const redisForBullMQ = bullmqConnection;

// ------------------------------------------------------------------
// Lifecycle logging
// ------------------------------------------------------------------
function attachLogging(client: Redis, name: string) {
  client.on('connect', () => logger.info(`[redis:${name}] connecting`));
  client.on('ready', () => logger.info(`[redis:${name}] ready`));
  client.on('error', (err: Error) => {
    logger.error(`[redis:${name}] error`, {
      message: err.message,
      code: (err as any).code,
    });
  });
  client.on('close', () => logger.warn(`[redis:${name}] connection closed`));
  client.on('reconnecting', (delayMs: number) =>
    logger.warn(`[redis:${name}] reconnecting in ${delayMs}ms`)
  );
  client.on('end', () => logger.warn(`[redis:${name}] connection ended`));
}

attachLogging(redis, 'app');
attachLogging(bullmqConnection, 'worker');

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
export async function pingRedis(timeoutMs = 2000): Promise<boolean> {
  try {
    const result = await Promise.race([
      redis.ping(),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('redis ping timeout')), timeoutMs)
      ),
    ]);
    return result === 'PONG';
  } catch (err: any) {
    logger.debug(`[redis:app] ping failed: ${err?.message || 'unknown'}`);
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  const closeOne = async (client: Redis, name: string) => {
    try {
      await Promise.race([
        client.quit(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('quit timeout')), 3000)
        ),
      ]);
      logger.info(`[redis:${name}] closed cleanly`);
    } catch (_) {
      try {
        client.disconnect();
        logger.warn(`[redis:${name}] forced disconnect`);
      } catch (__) {}
    }
  };
  await Promise.all([closeOne(redis, 'app'), closeOne(bullmqConnection, 'worker')]);
}

// Default export — covers any file that imports the module directly.
export default redis;
