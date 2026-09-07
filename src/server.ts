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
    // Connect to MongoDB and Redis with retry logic
    logger.info('Connecting to MongoDB...');
    await connectDB();
    logger.info('MongoDB connected successfully.');

    logger.info('Checking Redis connection...');
    await redis.ping();
    logger.info('Redis ready.');

    // Start the HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`SchoolFlow API running on port ${PORT}`);
    });

    // Start scheduled jobs
    await startReconciliationJob();
    await startExpiryJob();

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully`);
      server.close(async () => {
        logger.info('HTTP server closed');
        await closeAllQueues();
        await redis.quit();
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

// Start the app with retry on failure
startServer();
