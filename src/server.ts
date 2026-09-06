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
    // Ensure DB connected
    await connectDB();
    await redis.ping();
    logger.info('Redis ready');

    const server = app.listen(PORT, () => {
      logger.info(`SchoolFlow API running on port ${PORT}`);
    });

    // Start scheduled jobs (now using BullMQ)
    await startReconciliationJob();
    await startExpiryJob();

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
    process.exit(1);
  }
};

startServer();
