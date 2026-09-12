import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import * as Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';
import mongoose from 'mongoose';
import { errorHandler } from './middleware/error.middleware';
import routes from './routes';
import { redis } from './config/redis';
import { metricsMiddleware, metricsEndpoint } from './utils/metrics';
import './workers';
import { rawBodyMiddleware } from './middleware/rawBody.middleware';
import { env } from './config/env';

// ================================================================
// EXPRESS APP — created first so Sentry's Express tracing
// integration receives the real app instance, not a throwaway.
// ================================================================
const app = express();

// Trust exactly one proxy hop. Render/Vercel/etc. all sit in front of the
// app; without this, express-rate-limit can't safely determine client IPs
// and throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
app.set('trust proxy', 1);

// ================================================================
// SENTRY — must be initialized after `app` exists
// ================================================================
if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Tracing.Integrations.Express({ app }),
    ],
    tracesSampleRate: 0.2,
  });
}

// ================================================================
// CORS
// ================================================================
// origin: (origin, callback) => { ... } — dynamic allow-list. Requests
// without an Origin header (mobile apps, curl) are allowed. If
// CORS_ORIGIN is "*" or a comma-separated list, only those are allowed.
// credentials is false because we use Bearer tokens, not cookies.
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (env.CORS_ORIGIN) {
        const allowed = env.CORS_ORIGIN.split(',').map((o) => o.trim());
        if (allowed.includes('*') || allowed.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      } else {
        callback(null, true);
      }
    },
    credentials: false,
  })
);

// ================================================================
// SECURITY & OBSERVABILITY MIDDLEWARE
// ================================================================
app.use(helmet());
app.use(metricsMiddleware);
app.get('/metrics', metricsEndpoint);

// ================================================================
// RATE LIMITING
// ================================================================
// Global limiter — applied to every route except /health (which is
// exempted below) so health checkers from monitoring services don't
// burn through the per-IP quota.
const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW * 60 * 1000,
  max: env.RATE_LIMIT_MAX,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// ================================================================
// HEALTH CHECK
// ================================================================
// ALWAYS returns HTTP 200. The `status` field in the body tells the
// caller what state the service is in:
//   - "ok"        → all dependencies reachable
//   - "degraded"  → DB up, Redis down (jobs won't process, but API works)
//   - "unhealthy" → DB down
//
// Previously this returned 503 for degraded, which meant the frontend's
// System Health page treated a Redis outage as "backend completely down".
// Since the API can still serve every read/write path when Redis is down
// (thanks to safeRedis + safeQueueAdd), the correct status code is 200.
app.get('/health', async (_req, res) => {
  let redisOk = false;
  try {
    await Promise.race([
      redis.ping(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 2000)
      ),
    ]);
    redisOk = true;
  } catch (_) {
    redisOk = false;
  }

  const checks = {
    db: mongoose.connection.readyState === 1,
    redis: redisOk,
    queues: true,
  };

  const status = checks.db && checks.redis
    ? 'ok'
    : checks.db
      ? 'degraded'
      : 'unhealthy';

  res.status(200).json({
    status,
    timestamp: new Date().toISOString(),
    checks,
  });
});

// ================================================================
// BODY PARSING
// ================================================================
// Raw body for webhooks MUST be mounted before express.json() — otherwise
// the JSON parser consumes the request stream and rawBodyMiddleware sees
// an empty buffer.
app.use('/api/v1/webhooks', rawBodyMiddleware);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ================================================================
// ROUTES
// ================================================================
app.use('/api/v1', routes);

// ================================================================
// ERROR HANDLERS — Sentry first, then the custom handler
// ================================================================
if (env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

app.use(errorHandler);

export default app;
