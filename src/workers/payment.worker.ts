import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
// Placeholder for payment processing (e.g., retry failed transactions)
const worker = new Worker('schoolflow:payments', async (job) => {
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
