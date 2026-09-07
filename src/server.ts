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

    // Start the HTTP server immediately – don't wait for Redis
    const server = app.listen(PORT, () => {
      logger.info(`SchoolFlow API running on port ${PORT}`);
    });

    // Try Redis in the background – don't block startup
    (async () => {
      try {
        await redis.ping();
        logger.info('Redis ready.');
        // Start jobs only after Redis is confirmed working
        await startReconciliationJob();
        await startExpiryJob();
      } catch (err) {
        logger.warn('Redis not available – jobs will be retried later.');
        // Retry every 30 seconds
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
  } catch (error) {
    logger.error('Failed to start server:', error);
    // Retry after 5 seconds
    setTimeout(startServer, 5000);
  }
};

startServer();
