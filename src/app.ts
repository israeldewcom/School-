import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import * as Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';
import { errorHandler } from './middleware/error.middleware';
import routes from './routes';
import { connectDB } from './config/database';
import { redis } from './config/redis';
import { metricsMiddleware, metricsEndpoint } from './utils/metrics';
import './workers';
import { rawBodyMiddleware } from './middleware/rawBody.middleware';
import mongoose from 'mongoose';
import { env } from './config/env';

// Initialize Sentry only if DSN is provided
if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Tracing.Integrations.Express({ app: express() }),
    ],
    tracesSampleRate: 0.2,
  });
}

const app = express();

// Connect to DB (done in server.ts, but keep this for fallback)
connectDB();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: env.CORS_ORIGIN ? env.CORS_ORIGIN.split(',') : '*',
  credentials: true,
}));

// Prometheus metrics
app.use(metricsMiddleware);
app.get('/metrics', metricsEndpoint);

// Global rate limiter (per IP)
const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW * 60 * 1000,
  max: env.RATE_LIMIT_MAX,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// Health check – responds within 2 seconds even if Redis is down
app.get('/health', async (_req, res) => {
  let redisOk = false;
  try {
    // Ping Redis with a timeout of 2 seconds
    await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
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
  const healthy = Object.values(checks).every(v => v === true);
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
});

// Raw body for webhooks
app.use('/api/v1/webhooks', rawBodyMiddleware);

// JSON and URL-encoded body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/v1', routes);

// Sentry error handler – only if Sentry is initialized
if (env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

// Custom error handler
app.use(errorHandler);

export default app;
