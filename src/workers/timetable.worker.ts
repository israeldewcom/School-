import { Worker } from 'bullmq';
import { redisForBullMQ } from '../config/redis';
import { runTimetableReminders } from '../jobs/timetableReminder.job';
import logger from '../config/logger';

const worker = new Worker('timetable', async (job) => {
  if (job.name === 'timetable-reminders') {
    const { sent } = await runTimetableReminders();
    if (sent > 0) logger.info(`Timetable reminders sent: ${sent}`);
  }
}, {
  connection: redisForBullMQ,
  concurrency: 1,
  removeOnComplete: { count: 50 },
  removeOnFail: { count: 200 },
});

worker.on('failed', (job, err) => {
  logger.error(`Timetable job ${job?.id} failed: ${err.message}`);
});

logger.info('Timetable worker started');
