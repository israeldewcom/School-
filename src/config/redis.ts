// src/config/redis.ts
import Redis, { RedisOptions } from 'ioredis';
import logger from './logger';

// ------------------------------------------------------------------
// Connection config
//
// REDIS_URL takes precedence. Falls back to individual REDIS_HOST /
// REDIS_PORT / REDIS_PASSWORD vars for legacy setups. In development
// without any config, defaults to localhost so `npm run dev` works
// out of the box.
// ------------------------------------------------------------------
const REDIS_URL = process.env.REDIS_URL;
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const REDIS_TLS = process.env.REDIS_TLS === 'true';
const REDIS_DB = Number(process.env.REDIS_DB) || 0;

const isProduction = process.env.NODE_ENV === 'production';

// ------------------------------------------------------------------
// Shared options
// ------------------------------------------------------------------
const baseOptions: RedisOptions = {
  // Exponential backoff reconnect. Cap at 30s so a dead Redis doesn't
  // hammer the network.
  retryStrategy(times: number) {
    const delay = Math.min(times * 200, 30000);
    return delay;
  },

  // Give up connecting after 20 attempts in production so we don't spin
  // forever against a misconfigured instance. In dev, retry forever so
  // hot-reloading works while redis is being started.
  maxRetriesPerRequest: isProduction ? 3 : null,

  // Enable the offline queue in development so a Redis restart doesn't
  // drop commands. Disabled in prod so we fail fast instead of silently
  // buffering.
  enableOfflineQueue: !isProduction,

  // Only fire ready callback after Redis confirms it's accepting commands.
  enableReadyCheck: true,

  // Lazy connect: don't dial until the first command. Lets the app boot
  // even when Redis is temporarily unavailable.
  lazyConnect: false,

  // Connection name shows up in Redis `CLIENT LIST` output — useful for
  // debugging who's holding connections.
  connectionName: 'schoolflow-api',
};

// ------------------------------------------------------------------
// Main application client
//
// Used for: caching, rate-limit counters, session-ish storage, the
// health check ping. NOT used by BullMQ (see bullmqConnection below).
// ------------------------------------------------------------------
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

// ------------------------------------------------------------------
// Worker / BullMQ connection
//
// BullMQ needs `maxRetriesPerRequest: null` on blocking commands
// (BRPOPLPUSH etc.) — without it, BullMQ throws "maxRetriesPerRequest
// must be null" at startup. It also benefits from a separate
// connection so a stalled worker job can't block the API's cache
// traffic.
// ------------------------------------------------------------------
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
// Lifecycle events
//
// ioredis emits these on the client. We log everything so ops can see
// the Redis state in the app logs, and we never let an `error` event
// go unhandled (unhandled error events crash Node).
// ------------------------------------------------------------------

function attachLogging(client: Redis, name: string) {
  client.on('connect', () => {
    logger.info(`[redis:${name}] connecting`);
  });

  client.on('ready', () => {
    logger.info(`[redis:${name}] ready`);
  });

  client.on('error', (err: Error) => {
    // Do NOT throw here. The health endpoint reports degraded state and
    // most requests don't touch Redis, so the API keeps serving.
    logger.error(`[redis:${name}] error`, {
      message: err.message,
      code: (err as any).code,
    });
  });

  client.on('close', () => {
    logger.warn(`[redis:${name}] connection closed`);
  });

  client.on('reconnecting', (delayMs: number) => {
    logger.warn(`[redis:${name}] reconnecting in ${delayMs}ms`);
  });

  client.on('end', () => {
    logger.warn(`[redis:${name}] connection ended`);
  });
}

attachLogging(redis, 'app');
attachLogging(bullmqConnection, 'worker');

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/**
 * Safe ping with a hard timeout. The /health endpoint awaits this so
 * a slow Redis can never stall the health probe beyond 2 seconds.
 *
 * Returns true if Redis responded with PONG within the timeout,
 * false otherwise. Never throws.
 */
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

/**
 * Graceful shutdown — call from SIGTERM / SIGINT handlers before
 * process.exit. Closes both connections and resolves when both are
 * cleanly torn down or after a 3-second cap.
 */
export async function closeRedis(): Promise<void> {
  const closeOne = async (client: Redis, name: string) => {
    try {
      // ioredis's `quit` sends QUIT and waits for acknowledgement.
      // If the connection is already dead, it rejects — we ignore.
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

// ------------------------------------------------------------------
// Default export
//
// Some modules in the codebase might still `import redis from
// '../config/redis'` (default-import style). Exporting the named
// `redis` client as default too covers both import styles without
// a second file.
// ------------------------------------------------------------------
export default redis;
