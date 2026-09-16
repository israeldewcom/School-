// src/jobs/queues.ts
import { Queue, QueueOptions } from 'bullmq';
import { redisForBullMQ } from '../config/redis';
import logger from '../config/logger';

const baseOptions: QueueOptions = {
  connection: redisForBullMQ as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
};

export const smsQueue = new Queue('sms', baseOptions);
export const emailQueue = new Queue('email', baseOptions);
export const notificationQueue = new Queue('notification', baseOptions);
export const pdfQueue = new Queue('pdf', baseOptions);
export const reportQueue = new Queue('reports', baseOptions);
export const paymentQueue = new Queue('payments', baseOptions);
export const automationQueue = new Queue('automations', baseOptions);
export const expiryQueue = new Queue('expiry', baseOptions);
export const reconciliationQueue = new Queue('reconciliation', baseOptions);

export async function safeQueueAdd(
  queue: Queue,
  name: string,
  data: any,
  opts: any = {}
): Promise<any | null> {
  try {
    const job = await queue.add(name, data, opts);
    logger.debug(`Queued ${queue.name}/${name} → job ${job.id}`);
    return job;
  } catch (err: any) {
    logger.error(`safeQueueAdd failed for ${queue.name}/${name}: ${err?.message}`, {
      stack: err?.stack,
    });
    return null;
  }
}

export async function getAllQueueStatus() {
  const queues = [
    { name: 'sms', q: smsQueue },
    { name: 'email', q: emailQueue },
    { name: 'notification', q: notificationQueue },
    { name: 'pdf', q: pdfQueue },
    { name: 'reports', q: reportQueue },
    { name: 'payments', q: paymentQueue },
    { name: 'automations', q: automationQueue },
    { name: 'expiry', q: expiryQueue },
    { name: 'reconciliation', q: reconciliationQueue },
  ];

  const results = [];
  for (const { name, q } of queues) {
    try {
      const [waiting, active, completed, failed, paused] = await Promise.all([
        q.getWaitingCount(),
        q.getActiveCount(),
        q.getCompletedCount(),
        q.getFailedCount(),
        q.isPaused(),
      ]);
      results.push({
        name,
        count: waiting + active,
        waiting, active, completed, failed,
        progress: completed > 0 ? Math.round((completed / (completed + failed)) * 100) : 0,
        isPaused: paused,
      });
    } catch (err: any) {
      results.push({
        name, count: 0, waiting: 0, active: 0, completed: 0,
        failed: 0, progress: 0, isPaused: true, error: err?.message,
      });
    }
  }
  return results;
}

/**
 * Close every queue cleanly. Called by server.ts on SIGTERM/SIGINT.
 * Best-effort: any failure is logged and ignored so shutdown proceeds.
 */
export async function closeAllQueues(): Promise<void> {
  const queues = [
    smsQueue, emailQueue, notificationQueue, pdfQueue, reportQueue,
    paymentQueue, automationQueue, expiryQueue, reconciliationQueue,
  ];
  await Promise.all(
    queues.map(async (q) => {
      try {
        await q.close();
      } catch (err: any) {
        logger.warn(`Failed to close queue ${q.name}: ${err?.message}`);
      }
    })
  );
  logger.info('All queues closed');
}
