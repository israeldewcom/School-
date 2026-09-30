import express from 'express';
import { SubscriptionService } from './subscription.service';

const router = express.Router();

router.get('/pending', async (_req, res, next) => {
  try {
    const data = await SubscriptionService.listPendingRenewals();
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

router.post('/:id/approve', async (req, res, next) => {
  try {
    const data = await SubscriptionService.approveRenewal(req.params.id, req.userId!);
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

router.post('/:id/reject', async (req, res, next) => {
  try {
    const data = await SubscriptionService.rejectRenewal(req.params.id, req.userId!, req.body?.reason);
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

export default router;
