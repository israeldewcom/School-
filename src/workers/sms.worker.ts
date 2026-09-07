import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { sendSMS } from '../integrations/sms/termii';
import logger from '../config/logger';

const worker = new Worker('schoolflow:sms', async (job) => {
  const { to, message, senderId } = job.data;
  await sendSMS(to, message, senderId);
}, {
  connection: redis,
  concurrency: 5,
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 1000 },
});

worker.on('failed', (job, err) => {
  logger.error(`SMS job ${job?.id} failed: ${err.message}`);
});

logger.info('SMS worker started');
