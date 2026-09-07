import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';

const worker = new Worker('schoolflow_payments', async (job) => {
  // Implement payment processing logic
  logger.info('Processing payment job:', job.data);
}, {
  connection: redis,
  concurrency: 2,
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 1000 },
});

worker.on('failed', (job, err) => {
  logger.error(`Payment job ${job?.id} failed: ${err.message}`);
});

logger.info('Payment worker started');
