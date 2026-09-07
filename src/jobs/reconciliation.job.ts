import { reconciliationQueue } from './queues';

export const startReconciliationJob = () => {
  // Run every 10 minutes
  setInterval(async () => {
    await reconciliationQueue.add('reconcile-payments', {}, { repeat: { pattern: '*/10 * * * *' } });
  }, 10 * 60 * 1000);
};
