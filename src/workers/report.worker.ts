// src/workers/report.worker.ts
import { Worker, Job } from 'bullmq';
import mongoose from 'mongoose';
import { ReportCardService } from '../core/reportCards/reportCard.service';
import { redisForBullMQ } from '../config/redis';
import logger from '../config/logger';

interface ReportJobData {
  schoolId: string;
  sessionId: string;
  termId: string;
  classId?: string;
}

/**
 * Compile report cards for a whole school. The service batches per
 * class, so even a 500-student school compiles in a couple of
 * seconds — one students query + one results query per class.
 */
export async function processSchoolBatch(
  job: Job<ReportJobData>
): Promise<{ count: number; classes: number }> {
  const { schoolId, sessionId, termId } = job.data;

  if (!mongoose.isValidObjectId(schoolId)) {
    throw new Error(`Invalid schoolId: ${schoolId}`);
  }

  const result = await ReportCardService.processSchoolBatch(
    schoolId,
    sessionId,
    termId
  );

  logger.info(
    `report.worker: compiled ${result.count} report cards across ${result.classes} classes`,
    { schoolId, sessionId, termId }
  );

  return { count: result.count, classes: result.classes };
}

/**
 * Compile report cards for a single class.
 */
export async function processClassBatch(
  job: Job<ReportJobData>
): Promise<{ count: number; students: number }> {
  const { schoolId, classId, sessionId, termId } = job.data;

  if (!mongoose.isValidObjectId(schoolId) || !classId || !mongoose.isValidObjectId(classId)) {
    throw new Error('Invalid schoolId or classId');
  }

  const result = await ReportCardService.processClassBatch(
    schoolId,
    classId,
    sessionId,
    termId
  );

  return { count: result.count, students: result.students };
}

export function startReportWorker(): Worker {
  const worker = new Worker<ReportJobData>(
    'reports',
    async (job) => {
      if (job.name === 'compile-school-report') {
        return processSchoolBatch(job);
      }
      if (job.name === 'compile-class-report') {
        return processClassBatch(job);
      }
      logger.warn(`report.worker: unknown job name "${job.name}"`);
      return {};
    },
    {
      connection: redisForBullMQ as any,
      concurrency: 2,
    }
  );

  worker.on('failed', (job: Job<ReportJobData> | undefined, error: Error) => {
    logger.error(`report.worker job failed: ${job?.id ?? 'unknown'}`, {
      message: error.message,
      stack: error.stack,
    });
  });

  worker.on('completed', (job: Job<ReportJobData>, result: any) => {
    logger.info(`report.worker job completed: ${job.id}`, { result });
  });

  logger.info('Report worker started');
  return worker;
}

export default startReportWorker;
