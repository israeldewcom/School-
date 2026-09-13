// src/app.ts
import express, { Application, Request, Response } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import path from 'path';

import * as envConfig from './config/env';
import logger from './config/logger';
import { redis } from './config/redis';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';

// Normalize the env import — some codebases export a single `config`
// object, others export individual consts. This handles both.
const config: any = (envConfig as any).config || envConfig;
const NODE_ENV: string = process.env.NODE_ENV || config.NODE_ENV || 'development';
const CORS_ORIGINS: string = process.env.CORS_ORIGINS || config.CORS_ORIGINS || '*';
const APP_VERSION: string = process.env.APP_VERSION || config.APP_VERSION || '3.4.0';

const app: Application = express();

// ============================================================
// 0. TRUST PROXY
// ============================================================
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
const allowedOrigins: string[] = String(CORS_ORIGINS)
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes('*')) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
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
// Note: cookie-parser is intentionally NOT used. Auth is via Bearer
// tokens in the Authorization header, so no cookies are needed.
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ============================================================
// 4. INPUT SANITIZATION
// ============================================================
app.use(mongoSanitize());
app.use(hpp());

// ============================================================
// 5. COMPRESSION
// ============================================================
app.use(compression());

// ============================================================
// 6. REQUEST LOGGING
// ============================================================
if (NODE_ENV === 'production') {
  app.use(
    morgan(':method :url :status :res[content-length] - :response-time ms', {
      stream: { write: (msg: string) => logger.info(msg.trim()) },
      skip: (req: any) => req.originalUrl === '/health',
    })
  );
} else {
  app.use(
    morgan('dev', {
      skip: (req: any) => req.originalUrl === '/health',
    })
  );
}

// ============================================================
// 7. RATE LIMITING
// ============================================================
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please slow down and try again shortly.',
  },
  skip: (req: any) => req.originalUrl === '/health',
});
app.use(globalLimiter);

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

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================
// 8. STATIC FILES
// ============================================================
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
app.get('/health', async (_req: Request, res: Response) => {
  const start = Date.now();
  const dbOk = mongoose.connection.readyState === 1;

  let redisOk = false;
  try {
    await Promise.race([
      redis.ping(),
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error('redis timeout')), 2000)),
    ]);
    redisOk = true;
  } catch (_) {
    redisOk = false;
  }

  const checks = {
    db: dbOk,
    redis: redisOk,
    queues: redisOk,
  };

  const status = dbOk && redisOk ? 'ok' : dbOk ? 'degraded' : 'unhealthy';

  res.status(200).json({
    status,
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    responseTimeMs: Date.now() - start,
    version: APP_VERSION,
    environment: NODE_ENV,
    checks,
  });
});

app.get('/live', (_req: Request, res: Response) => {
  res.status(200).send('OK');
});

app.get('/ready', (_req: Request, res: Response) => {
  const dbOk = mongoose.connection.readyState === 1;
  if (!dbOk) return res.status(503).json({ ready: false, reason: 'db not connected' });
  return res.status(200).json({ ready: true });
});

// ============================================================
// 10. API ROUTES
// ============================================================
// Auth and webhook limiters are applied first, then requests fall
// through to the main router which serves the actual handlers.
app.use('/api/v1/auth', authLimiter);
app.use('/api/v1/webhooks', webhookLimiter);
app.use('/api/v1', routes);

app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'SchoolFlow API',
    status: 'running',
    version: APP_VERSION,
    docs: '/api/v1',
    health: '/health',
  });
});

// ============================================================
// 11. 404 CATCH-ALL
// ============================================================
app.use(notFoundHandler);

// ============================================================
// 12. GLOBAL ERROR HANDLER
// ============================================================
app.use(errorHandler);

// ============================================================
// 13. UNHANDLED REJECTIONS / EXCEPTIONS
// ============================================================
process.on('unhandledRejection', (reason: any, _promise: Promise<any>) => {
  logger.error('💥 UNHANDLED REJECTION — shutting down', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  setTimeout(() => process.exit(1), 100);
});

process.on('uncaughtException', (err: Error) => {
  logger.error('💥 UNCAUGHT EXCEPTION — shutting down', {
    message: err.message,
    stack: err.stack,
  });
  setTimeout(() => process.exit(1), 100);
});

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
