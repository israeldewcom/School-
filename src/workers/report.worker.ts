import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';

const worker = new Worker('schoolflow_reports', async (job) => {
  logger.info('Generating report:', job.data);
}, {
  connection: redis,
  concurrency: 1,
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 1000 },
});

worker.on('failed', (job, err) => {
  logger.error(`Report job ${job?.id} failed: ${err.message}`);
});

logger.info('Report worker started');
