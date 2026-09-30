import express, { Request, Response } from 'express';
import {
  smsQueue,
  emailQueue,
  notificationQueue,
  pdfQueue,
  reportQueue,
  paymentQueue,
  automationQueue,
  expiryQueue,
  reconciliationQueue,
  getAllQueueStatus,
} from '../../jobs/queues';

const router = express.Router();

const queueMap: Record<string, any> = {
  sms: smsQueue,
  email: emailQueue,
  notification: notificationQueue,
  pdf: pdfQueue,
  reports: reportQueue,
  payments: paymentQueue,
  automations: automationQueue,
  expiry: expiryQueue,
  reconciliation: reconciliationQueue,
};

function findQueue(req: Request, res: Response) {
  const q = queueMap[req.params.name];
  if (!q) {
    res.status(404).json({ success: false, message: 'Queue not found' });
    return null;
  }
  return q;
}

router.get('/status', async (_req, res, next) => {
  try {
    res.json({ success: true, data: await getAllQueueStatus() });
  } catch (error) { next(error); }
});

router.get('/:name/jobs', async (req, res, next) => {
  try {
    const q = findQueue(req, res);
    if (!q) return;
    const jobs = await q.getJobs(['waiting', 'active', 'delayed', 'failed', 'completed'], 0, 49);
    const data = await Promise.all(
      jobs.filter(Boolean).map(async (j: any) => ({
        id: j.id,
        name: j.name,
        status: await j.getState(),
        attemptsMade: j.attemptsMade,
        failedReason: j.failedReason || null,
        timestamp: j.timestamp,
      }))
    );
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

router.get('/:name/jobs/:jobId', async (req, res, next) => {
  try {
    const q = findQueue(req, res);
    if (!q) return;
    const j = await q.getJob(req.params.jobId);
    if (!j) {
      res.status(404).json({ success: false, message: 'Job not found' });
      return;
    }
    res.json({
      success: true,
      data: {
        id: j.id,
        name: j.name,
        status: await j.getState(),
        data: j.data,
        attemptsMade: j.attemptsMade,
        failedReason: j.failedReason || null,
        timestamp: j.timestamp,
        processedOn: j.processedOn,
        finishedOn: j.finishedOn,
      },
    });
  } catch (error) { next(error); }
});

router.post('/:name/retry/:jobId', async (req, res, next) => {
  try {
    const q = findQueue(req, res);
    if (!q) return;
    const j = await q.getJob(req.params.jobId);
    if (!j) {
      res.status(404).json({ success: false, message: 'Job not found' });
      return;
    }
    await j.retry();
    res.json({ success: true, data: { retried: true } });
  } catch (error) { next(error); }
});

router.post('/:name/pause', async (req, res, next) => {
  try {
    const q = findQueue(req, res);
    if (!q) return;
    await q.pause();
    res.json({ success: true, data: { paused: true } });
  } catch (error) { next(error); }
});

router.post('/:name/resume', async (req, res, next) => {
  try {
    const q = findQueue(req, res);
    if (!q) return;
    await q.resume();
    res.json({ success: true, data: { paused: false } });
  } catch (error) { next(error); }
});

export default router;
