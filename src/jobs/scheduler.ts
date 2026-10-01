// src/jobs/scheduler.ts
import { startExpiryJob } from './expiry.job';
import { startTimetableReminderJob } from './timetableReminder.job';
import { reconciliationQueue } from './queues';
import logger from '../config/logger';

/**
 * Registers every repeating job exactly once (stable job ids make re-adding a
 * no-op). Called from server.ts after the HTTP server is up.
 */
export async function scheduleRepeatingJobs(): Promise<void> {
  try { await startExpiryJob(); } catch (err: any) { logger.warn(`expiry schedule failed: ${err?.message}`); }
  try { await startTimetableReminderJob(); } catch (err: any) { logger.warn(`timetable schedule failed: ${err?.message}`); }
  try {
    await reconciliationQueue.add('reconcile-payments', {}, {
      repeat: { pattern: '*/10 * * * *' },
      jobId: 'reconcile-payments-10min',
    });
    logger.info('Reconciliation job scheduled (every 10 minutes)');
  } catch (err: any) {
    logger.warn(`reconciliation schedule failed: ${err?.message}`);
  }
}
