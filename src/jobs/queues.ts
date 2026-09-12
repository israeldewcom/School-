import { Queue } from 'bullmq';
import { redisForBullMQ } from '../config/redis';
import logger from '../config/logger';

// ============================================================================
// QUEUES
// ============================================================================
// All Queue instances use redisForBullMQ — a dedicated connection with
// maxRetriesPerRequest: null, which BullMQ hard-requires. Passing the
// app-level `redis` client here causes this crash at startup:
//
//   Error: BullMQ: Your redis options maxRetriesPerRequest must be null.

export const smsQueue = new Queue('schoolflow_sms', { connection: redisForBullMQ });
export const emailQueue = new Queue('schoolflow_email', { connection: redisForBullMQ });
export const pdfQueue = new Queue('schoolflow_pdf', { connection: redisForBullMQ });
export const paymentQueue = new Queue('schoolflow_payments', { connection: redisForBullMQ });
export const automationQueue = new Queue('schoolflow_automations', { connection: redisForBullMQ });
export const reportQueue = new Queue('schoolflow_reports', { connection: redisForBullMQ });
export const notificationQueue = new Queue('schoolflow_notifications', { connection: redisForBullMQ });
export const reconciliationQueue = new Queue('schoolflow_reconciliation', { connection: redisForBullMQ });
export const expiryQueue = new Queue('schoolflow_expiry', { connection: redisForBullMQ });

// ============================================================================
// safeQueueAdd
// ============================================================================
// Races queue.add() against a short timeout so a slow or unreachable Redis
// can't hang the HTTP request that's awaiting the enqueue. Callers must
// treat null as "job not queued" and continue.
export const safeQueueAdd = async <T = any>(
  queue: Queue,
  jobName: string,
  data: any,
  opts: any = {},
  timeoutMs: number = 3000
): Promise<T | null> => {
  try {
    return await Promise.race([
      queue.add(jobName, data, opts) as Promise<T>,
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error(`Queue ${queue.name} timed out`)), timeoutMs)
      ),
    ]);
  } catch (err: any) {
    logger.error(`safeQueueAdd(${queue.name}/${jobName}) failed: ${err.message}`);
    return null;
  }
};

export const closeAllQueues = async () => {
  await Promise.all([
    smsQueue.close(),
    emailQueue.close(),
    pdfQueue.close(),
    paymentQueue.close(),
    automationQueue.close(),
    reportQueue.close(),
    notificationQueue.close(),
    reconciliationQueue.close(),
    expiryQueue.close(),
  ]);
};
