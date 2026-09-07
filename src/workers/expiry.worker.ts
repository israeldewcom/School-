import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { checkExpiredSubscriptions } from '../jobs/expiry.job';
import logger from '../config/logger';

const worker = new Worker('schoolflow_expiry', async (job) => {
  if (job.name === 'check-expired') {
    await checkExpiredSubscriptions();
  }
}, {
  connection: redis,
  concurrency: 1,
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 1000 },
});

worker.on('failed', (job, err) => {
  logger.error(`Expiry job ${job?.id} failed: ${err.message}`);
});

logger.info('Expiry worker started');
