// src/app.ts
import express, { Application, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import cookieParser from 'cookie-parser';
import path from 'path';

import config from './config/env';
import logger from './config/logger';
import redis from './config/redis';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';

const app: Application = express();

// ============================================================
// 0. TRUST PROXY
// ============================================================
// Render/Heroku/Vercel all sit behind a reverse proxy. This makes
// req.ip, req.protocol and rate limiting behave correctly.
app.set('trust proxy', 1);

// ============================================================
// 1. SECURITY HEADERS
// ============================================================
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false, // API only — no HTML served
  })
);

// ============================================================
// 2. CORS
// ============================================================
const allowedOrigins = (config.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin / server-to-server / Postman
      if (!origin) return callback(null, true);
      // Wildcard
      if (allowedOrigins.includes('*')) return callback(null, true);
      // Exact match
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Localhost dev (any port)
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      // Vercel preview deploys for the SchoolFlow demo
      if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) {
        return callback(null, true);
      }
      logger.warn(`CORS blocked origin: ${origin}`);
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'X-Total-Count'],
    maxAge: 86400,
  })
);

// ============================================================
// 3. BODY PARSING
// ============================================================
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());

// ============================================================
// 4. INPUT SANITIZATION
// ============================================================
// Block $ and . operators in body/params (NoSQL injection).
app.use(mongoSanitize());
// Prevent HTTP parameter pollution (e.g. ?sort=a&sort=b).
app.use(hpp());

// ============================================================
// 5. COMPRESSION
// ============================================================
app.use(compression());

// ============================================================
// 6. REQUEST LOGGING
// ============================================================
// Short format in prod (JSON-ish lines), verbose in dev.
if (config.NODE_ENV === 'production') {
  app.use(
    morgan(':method :url :status :res[content-length] - :response-time ms', {
      stream: { write: (msg: string) => logger.http(msg.trim()) },
      skip: (req) => req.originalUrl === '/health',
    })
  );
} else {
  app.use(
    morgan('dev', {
      skip: (req) => req.originalUrl === '/health',
    })
  );
}

// ============================================================
// 7. RATE LIMITING
// ============================================================
// Global limiter — generous, protects against brute scanning.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please slow down and try again shortly.',
  },
  // Skip health checks — monitoring tools hammer them.
  skip: (req) => req.originalUrl === '/health',
});
app.use(globalLimiter);

// Stricter limiter for auth endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please wait 15 minutes and try again.',
  },
});

// Webhook limiter — payments providers can burst, keep it loose.
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================
// 8. STATIC FILES (documents/receipts if stored locally)
// ============================================================
// Note: If you're storing files on S3/Cloudinary, you can delete this
// block. It's here in case uploaded docs live on disk in prod.
app.use(
  '/uploads',
  express.static(path.join(process.cwd(), 'uploads'), {
    maxAge: '7d',
    etag: true,
    fallthrough: true,
  })
);

// ============================================================
// 9. HEALTH CHECK — ALWAYS RETURNS 200
// ============================================================
// The frontend treats non-2xx as "the server is down" and shows a hard
// error. We always return 200 here so monitoring dashboards and the
// in-app System Health page can read the JSON body's `status` field.
// Redis being down reports "degraded", not "unhealthy" — the API still
// works without Redis for most operations.
app.get('/health', async (_req: Request, res: Response) => {
  const start = Date.now();

  // Database check — readyState === 1 means connected.
  const dbOk = mongoose.connection.readyState === 1;

  // Redis check with a hard 2s timeout — Redis being down must never
  // stall the health endpoint.
  let redisOk = false;
  try {
    await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('redis timeout')), 2000)),
    ]);
    redisOk = true;
  } catch (_) {
    redisOk = false;
  }

  const checks = {
    db: dbOk,
    redis: redisOk,
    queues: redisOk, // queues depend on Redis — same signal
  };

  // Deterministic status:
  //  - ok         : everything green
  //  - degraded   : DB up but Redis down (API still serves most routes)
  //  - unhealthy  : DB down (nothing works)
  const status = dbOk && redisOk ? 'ok' : dbOk ? 'degraded' : 'unhealthy';

  // Always HTTP 200. The client reads `status` from the body.
  res.status(200).json({
    status,
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    responseTimeMs: Date.now() - start,
    version: config.APP_VERSION || '3.4.0',
    environment: config.NODE_ENV,
    checks,
  });
});

// Simple liveness probe (for container orchestration).
app.get('/live', (_req: Request, res: Response) => {
  res.status(200).send('OK');
});

// Readiness probe (for load balancers) — 200 only when DB is up.
app.get('/ready', async (_req: Request, res: Response) => {
  const dbOk = mongoose.connection.readyState === 1;
  if (!dbOk) return res.status(503).json({ ready: false, reason: 'db not connected' });
  return res.status(200).json({ ready: true });
});

// ============================================================
// 10. API ROUTES
// ============================================================
// Auth is mounted separately so we can attach the stricter limiter
// only to it, and so the shape of the prefix is easy to reason about.
app.use('/api/v1/auth', authLimiter);
app.use('/api/v1/webhooks', webhookLimiter);

// Everything else lives under routes/index.ts.
app.use('/api/v1', routes);

// Root route — helpful for humans hitting the API host.
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'SchoolFlow API',
    status: 'running',
    version: config.APP_VERSION || '3.4.0',
    docs: '/api/v1',
    health: '/health',
  });
});

// ============================================================
// 11. 404 CATCH-ALL
// ============================================================
// Must be registered after all routes. Returns JSON, not HTML, so
// the frontend's error toast shows a useful message.
app.use(notFoundHandler);

// ============================================================
// 12. GLOBAL ERROR HANDLER
// ============================================================
// Must be last. Maps AppError / Mongoose / JWT errors to proper HTTP
// status codes. This is the middleware that converts "Internal Server
// Error" 500s into "400 Invalid studentId" style responses.
app.use(errorHandler);

// ============================================================
// 13. UNHANDLED REJECTIONS / EXCEPTIONS
// ============================================================
// A promise rejection that escapes Express will kill the process in
// Node 16+. Log it, then exit so the platform restarts the container.
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('💥 UNHANDLED REJECTION — shutting down', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  // Give the logger a tick to flush, then exit.
  setTimeout(() => process.exit(1), 100);
});

process.on('uncaughtException', (err: Error) => {
  logger.error('💥 UNCAUGHT EXCEPTION — shutting down', {
    message: err.message,
    stack: err.stack,
  });
  setTimeout(() => process.exit(1), 100);
});

// Graceful shutdown so in-flight requests complete.
process.on('SIGTERM', () => {
  logger.info('SIGTERM received — closing gracefully');
  mongoose.connection.close(false).then(() => {
    logger.info('Mongo connection closed. Exiting.');
    process.exit(0);
  });
});
process.on('SIGINT', () => {
  logger.info('SIGINT received — closing gracefully');
  mongoose.connection.close(false).then(() => process.exit(0));
});

export default app;
