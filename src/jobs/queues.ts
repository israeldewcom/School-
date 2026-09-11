import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';

export const smsQueue = new Queue('schoolflow_sms', { connection: redis });
export const emailQueue = new Queue('schoolflow_email', { connection: redis });
export const pdfQueue = new Queue('schoolflow_pdf', { connection: redis });
export const paymentQueue = new Queue('schoolflow_payments', { connection: redis });
export const automationQueue = new Queue('schoolflow_automations', { connection: redis });
export const reportQueue = new Queue('schoolflow_reports', { connection: redis });
export const notificationQueue = new Queue('schoolflow_notifications', { connection: redis });
export const reconciliationQueue = new Queue('schoolflow_reconciliation', { connection: redis });
export const expiryQueue = new Queue('schoolflow_expiry', { connection: redis });

// ============================================================================
// safeQueueAdd — the reason this exists
// ============================================================================
// BullMQ's queue.add() returns a promise that resolves once Redis has
// acknowledged the job. When Redis is unreachable, that promise can hang
// forever — which means the HTTP request that's awaiting it never returns
// either. This wrapper races the queue.add() against a 3-second timer and
// resolves to null on timeout. The job is lost, but the caller's response
// goes out. Callers should treat null as "job not queued" and continue.
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
