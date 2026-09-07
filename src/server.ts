import app from './app';
import logger from './config/logger';
import { connectDB, disconnectDB } from './config/database';
import { redis } from './config/redis';
import { env } from './config/env';
import { closeAllQueues } from './jobs/queues';
import { startReconciliationJob } from './jobs/reconciliation.job';
import { startExpiryJob } from './jobs/expiry.job';

const PORT = env.PORT;

const startServer = async () => {
  try {
    // Connect to MongoDB (critical)
    logger.info('Connecting to MongoDB...');
    await connectDB();
    logger.info('MongoDB connected successfully.');

    // Try Redis but don't block if it fails – it will retry in background
    logger.info('Checking Redis connection...');
    try {
      await redis.ping();
      logger.info('Redis ready.');
    } catch (err) {
      logger.warn('Redis is not available – some features may be degraded.');
      // Redis will keep retrying in the background
    }

    // Start the HTTP server regardless of Redis state
    const server = app.listen(PORT, () => {
      logger.info(`SchoolFlow API running on port ${PORT}`);
    });

    // Start scheduled jobs (they will also handle Redis failures gracefully)
    await startReconciliationJob();
    await startExpiryJob();

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
  } catch (error) {
    logger.error('Failed to start server:', error);
    // Retry after 5 seconds
    setTimeout(startServer, 5000);
  }
};

startServer();
