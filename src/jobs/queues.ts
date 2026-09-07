import { Queue } from 'bullmq';
import { redis } from '../config/redis';

export const smsQueue = new Queue('schoolflow:sms', { connection: redis });
export const emailQueue = new Queue('schoolflow:email', { connection: redis });
export const pdfQueue = new Queue('schoolflow:pdf', { connection: redis });
export const paymentQueue = new Queue('schoolflow:payments', { connection: redis });
export const automationQueue = new Queue('schoolflow:automations', { connection: redis });
export const reportQueue = new Queue('schoolflow:reports', { connection: redis });
export const notificationQueue = new Queue('schoolflow:notifications', { connection: redis });
export const reconciliationQueue = new Queue('schoolflow:reconciliation', { connection: redis });
export const expiryQueue = new Queue('schoolflow:expiry', { connection: redis });

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
