import { Queue } from 'bullmq';
import { redis } from '../config/redis';

export const smsQueue = new Queue('schoolflow_sms', { connection: redis });
export const emailQueue = new Queue('schoolflow_email', { connection: redis });
export const pdfQueue = new Queue('schoolflow_pdf', { connection: redis });
export const paymentQueue = new Queue('schoolflow_payments', { connection: redis });
export const automationQueue = new Queue('schoolflow_automations', { connection: redis });
export const reportQueue = new Queue('schoolflow_reports', { connection: redis });
export const notificationQueue = new Queue('schoolflow_notifications', { connection: redis });
export const reconciliationQueue = new Queue('schoolflow_reconciliation', { connection: redis });
export const expiryQueue = new Queue('schoolflow_expiry', { connection: redis });

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
