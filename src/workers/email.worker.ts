import { Worker } from 'bullmq';
import { redisForBullMQ } from '../config/redis';
import { sendEmail } from '../integrations/email/nodemailer';
import logger from '../config/logger';

const worker = new Worker('schoolflow_email', async (job) => {
  const { to, subject, html, text } = job.data;
  await sendEmail(to, subject, html, text);
}, {
  connection: redisForBullMQ,
  concurrency: 5,
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 1000 },
});

worker.on('failed', (job, err) => {
  logger.error(`Email job ${job?.id} failed: ${err.message}`);
});

logger.info('Email worker started');
