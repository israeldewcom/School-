import { Worker } from 'bullmq';
import { redisForBullMQ } from '../config/redis';
import { sendSMS } from '../integrations/sms/termii';
import logger from '../config/logger';

const worker = new Worker('schoolflow_sms', async (job) => {
  const { schoolId, to, message, senderId } = job.data;

  // Guard: jobs queued by older code may not carry schoolId. Skip them
  // with a clear log rather than crashing sendSMS with a bad arg.
  if (!schoolId) {
    logger.warn('SMS job missing schoolId — skipping (legacy job format)');
    return;
  }

  await sendSMS(schoolId, to, message, senderId);
}, {
  connection: redisForBullMQ,
  concurrency: 5,
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 1000 },
});

worker.on('failed', (job, err) => {
  logger.error(`SMS job ${job?.id} failed: ${err.message}`);
});

logger.info('SMS worker started');
