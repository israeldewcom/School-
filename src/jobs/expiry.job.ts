import { expiryQueue } from './queues';
import { Subscription } from '../models/Subscription';
import logger from '../config/logger';

export const checkExpiredSubscriptions = async () => {
  const expired = await Subscription.updateMany(
    { 
      status: 'ACTIVE', 
      endDate: { $lt: new Date() } 
    },
    { status: 'EXPIRED' }
  );
  
  if (expired.modifiedCount > 0) {
    logger.warn(`Auto-expired ${expired.modifiedCount} subscriptions`);
  }
  return expired.modifiedCount;
};

export const startExpiryJob = async () => {
  // Remove any existing repeatable to avoid duplicates
  await expiryQueue.removeRepeatableByKey('expiry-check');
  
  // Schedule the job to run every hour using BullMQ repeatable
  await expiryQueue.add('check-expired', {}, {
    repeat: { pattern: '0 */1 * * *' },
    jobId: 'expiry-check',
  });
  
  logger.info('Expiry job scheduled (every hour)');
};
