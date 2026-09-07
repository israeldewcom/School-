import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { PaymentService } from '../core/payments/payment.service';
import logger from '../config/logger';

const worker = new Worker('schoolflow:reconciliation', async (job) => {
  if (job.name === 'reconcile-payments') {
    const count = await PaymentService.reconcilePendingPayments();
    logger.info(`Reconciled ${count} pending payments`);
  }
}, {
  connection: redis,
  concurrency: 1,
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 1000 },
});

worker.on('failed', (job, err) => {
  logger.error(`Reconciliation job ${job?.id} failed: ${err.message}`);
});

logger.info('Reconciliation worker started');
