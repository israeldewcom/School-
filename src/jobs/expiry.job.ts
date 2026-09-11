import { expiryQueue } from './queues';
import { Subscription } from '../models/Subscription';
import logger from '../config/logger';
import { invalidateSubscriptionCache } from '../middleware/subscription.middleware';

export const checkExpiredSubscriptions = async () => {
  const expired = await Subscription.find({
    status: 'ACTIVE',
    endDate: { $lt: new Date() },
  }).select('_id schoolId');

  if (expired.length === 0) return 0;

  await Subscription.updateMany(
    { _id: { $in: expired.map((s) => s._id) } },
    { status: 'EXPIRED' }
  );

  // Invalidate the per-school cache so subscription.middleware sees the
  // new status immediately instead of up to 5 minutes later.
  for (const sub of expired) {
    try {
      await invalidateSubscriptionCache(sub.schoolId.toString());
    } catch (_) {}
  }

  logger.warn(`Auto-expired ${expired.length} subscriptions`);
  return expired.length;
};

export const startExpiryJob = async () => {
  // BullMQ computes repeatable keys from the job name + repeat options.
  // The correct remove call uses those, not a jobId we invented.
  try {
    const repeatables = await expiryQueue.getRepeatableJobs();
    for (const r of repeatables) {
      if (r.name === 'check-expired') {
        await expiryQueue.removeRepeatableByKey(r.key);
      }
    }
  } catch (_) {}

  await expiryQueue.add('check-expired', {}, {
    repeat: { pattern: '0 */1 * * *' },
    jobId: 'expiry-check-hourly', // stable id so re-add is a no-op
  });

  logger.info('Expiry job scheduled (every hour)');
};
