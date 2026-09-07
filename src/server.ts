import app from './app';
import logger from './config/logger';
import { connectDB, disconnectDB } from './config/database';
import { redis } from './config/redis';
import { env } from './config/env';
import { closeAllQueues } from './jobs/queues';
import { startReconciliationJob } from './jobs/reconciliation.job';
import { startExpiryJob } from './jobs/expiry.job';

const PORT = env.PORT;

const startServer = () => {
  // Start the HTTP server immediately
  const server = app.listen(PORT, () => {
    logger.info(`SchoolFlow API running on port ${PORT}`);
  });

  // Connect to MongoDB in the background (non-blocking)
  (async () => {
    try {
      await connectDB();
      logger.info('MongoDB connected successfully.');
    } catch (err) {
      logger.error('MongoDB connection failed – retrying in 30s');
      setTimeout(() => connectDB(), 30000);
    }
  })();

  // Connect to Redis in the background (non-blocking)
  (async () => {
    try {
      await redis.ping();
      logger.info('Redis ready.');
      // Start jobs only if Redis is available
      await startReconciliationJob();
      await startExpiryJob();
    } catch (err) {
      logger.warn('Redis not available – will retry in 30s');
      setInterval(async () => {
        try {
          await redis.ping();
          logger.info('Redis reconnected – starting jobs.');
          await startReconciliationJob();
          await startExpiryJob();
          clearInterval(this);
        } catch (_) {}
      }, 30000);
    }
  })();

  // Graceful shutdown
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

// Catch any unhandled rejections to prevent crash
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection:', err);
});

startServer();
