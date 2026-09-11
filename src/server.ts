// src/server.ts

import './bootstrap';   // 👈 MUST be first. Registers mongoose plugins.

import app from './app';
import logger from './config/logger';
import { connectDB, disconnectDB } from './config/database';
import { redis } from './config/redis';
import { env } from './config/env';
import { closeAllQueues } from './jobs/queues';
import { startReconciliationJob } from './jobs/reconciliation.job';
import { startExpiryJob } from './jobs/expiry.job';
import { ensureDefaultPlans } from './scripts/ensure-default-plans';
import { ensureDefaultPermissions } from './scripts/ensure-default-permissions';

const PORT = env.PORT;

const startServer = () => {
  const server = app.listen(PORT, () => {
    logger.info(`SchoolFlow API running on port ${PORT}`);
  });

  (async () => {
    try {
      await connectDB();
      logger.info('MongoDB connected successfully.');
      await ensureDefaultPlans();
      await ensureDefaultPermissions();
    } catch (err) {
      logger.error('MongoDB connection failed – retrying in 30s');
      setTimeout(() => connectDB(), 30000);
    }
  })();

  (async () => {
    try {
      await redis.ping();
      logger.info('Redis ready.');
      await startReconciliationJob();
      await startExpiryJob();
    } catch (err) {
      logger.warn('Redis not available – will retry in 30s');
      const interval = setInterval(async () => {
        try {
          await redis.ping();
          logger.info('Redis reconnected – starting jobs.');
          await startReconciliationJob();
          await startExpiryJob();
          clearInterval(interval);
        } catch (_) {}
      }, 30000);
    }
  })();

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(async () => {
      logger.info('HTTP server closed');
      await closeAllQueues().catch(() => {});
      await redis.quit().catch(() => {});
      await disconnectDB();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection:', err);
});

startServer();
