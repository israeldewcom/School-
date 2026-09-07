import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { Automation } from '../models/Automation';
import { sendSMS } from '../integrations/sms/termii';
import { sendEmail } from '../integrations/email/nodemailer';

const worker = new Worker('schoolflow:automations', async (job) => {
  const { automationId, action } = job.data; // removed unused 'data' variable
  const automation = await Automation.findById(automationId);
  if (!automation) {
    throw new Error(`Automation ${automationId} not found`);
  }
  switch (action.type) {
    case 'SMS':
      if (action.config.to && action.config.message) {
        await sendSMS(action.config.to, action.config.message);
      }
      break;
    case 'EMAIL':
      if (action.config.to && action.config.subject && action.config.html) {
        await sendEmail(action.config.to, action.config.subject, action.config.html);
      }
      break;
    case 'IN_APP':
      // Create in-app notification
      // ...
      break;
    case 'WEBHOOK':
      // Call webhook
      // ...
      break;
    default:
      logger.warn(`Unknown action type: ${action.type}`);
  }
}, {
  connection: redis,
  concurrency: 3,
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 1000 },
});

worker.on('failed', (job, err) => {
  logger.error(`Automation job ${job?.id} failed: ${err.message}`);
});

logger.info('Automation worker started');
