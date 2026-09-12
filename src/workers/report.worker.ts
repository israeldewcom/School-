import { Worker } from 'bullmq';
import { redisForBullMQ } from '../config/redis';
import { ReportCardService } from '../core/reportCards/reportCard.service';
import { PaymentService } from '../core/payments/payment.service';
import logger from '../config/logger';

const worker = new Worker('schoolflow_reports', async (job) => {
  if (job.name === 'generate-school-report-cards') {
    const { batchId, schoolId, sessionId, termId, templateId } = job.data;
    await ReportCardService.processSchoolBatch(batchId, schoolId, sessionId, termId, templateId);
  } else if (job.name === 'generate-school-receipts') {
    const { batchId, schoolId } = job.data;
    await PaymentService.processReceiptBatch(batchId, schoolId);
  } else {
    logger.warn(`Unknown report job: ${job.name}`);
  }
}, {
  connection: redisForBullMQ,
  concurrency: 1,
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 1000 },
});

worker.on('failed', (job, err) => {
  logger.error(`Report job ${job?.id} failed: ${err.message}`);
});

logger.info('Report worker started');
