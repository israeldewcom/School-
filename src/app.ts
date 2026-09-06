import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';
import { errorHandler } from './middleware/error.middleware';
import routes from './routes';
import logger from './config/logger';
import { env } from './config/env';
import { connectDB } from './config/database';
import { redis } from './config/redis';
import { metricsMiddleware, metricsEndpoint } from './utils/metrics';
import './workers';
import { rawBodyMiddleware } from './middleware/rawBody.middleware';
import mongoose from 'mongoose';

// Initialize Sentry
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

// Connect to DB and ensure replica set
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

// Health check
app.get('/health', async (req, res) => {
  const checks = {
    db: mongoose.connection.readyState === 1,
    redis: await redis.ping().then(() => true).catch(() => false),
    queues: true, // could check worker liveness
  };
  const healthy = Object.values(checks).every(v => v === true);
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
});

// Raw body for webhooks (must come before JSON parser)
app.use('/api/v1/webhooks', rawBodyMiddleware);

// JSON and URL-encoded body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/v1', routes);

// Sentry error handler (must be before our errorHandler)
app.use(Sentry.Handlers.errorHandler());

// Custom error handler
app.use(errorHandler);

export default app;
