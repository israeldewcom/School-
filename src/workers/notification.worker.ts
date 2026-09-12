import { Worker } from 'bullmq';
import { redisForBullMQ } from '../config/redis';
import logger from '../config/logger';

const worker = new Worker('schoolflow_notifications', async (job) => {
  logger.info('Sending notification:', job.data);
}, {
  connection: redisForBullMQ,
  concurrency: 5,
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 1000 },
});

worker.on('failed', (job, err) => {
  logger.error(`Notification job ${job?.id} failed: ${err.message}`);
});

logger.info('Notification worker started');
