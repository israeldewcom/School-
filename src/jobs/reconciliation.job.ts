import { reconciliationQueue } from './queues';
import { PaymentService } from '../core/payments/payment.service';
import logger from '../config/logger';

export const startReconciliationJob = () => {
  // Run every 10 minutes
  setInterval(async () => {
    await reconciliationQueue.add('reconcile-payments', {}, { repeat: { pattern: '*/10 * * * *' } });
  }, 10 * 60 * 1000);
};
