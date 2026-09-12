import express from 'express';
import { requirePermission } from '../../middleware/permission.middleware';
import { AnalyticsService } from './analytics.service';

const router = express.Router();

router.get('/stats', requirePermission('analytics', 'read'), async (req, res, next) => {
  try {
    const stats = await AnalyticsService.getSchoolStats(req.schoolId!);
    res.json({ success: true, data: stats });
  } catch (error) { next(error); }
});

router.get('/daily-collection', requirePermission('analytics', 'read'), async (req, res, next) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 14;
    const data = await AnalyticsService.getDailyCollection(req.schoolId!, days);
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

router.get('/payment-methods', requirePermission('analytics', 'read'), async (req, res, next) => {
  try {
    const data = await AnalyticsService.getPaymentMethodBreakdown(req.schoolId!);
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

router.get('/class-collection', requirePermission('analytics', 'read'), async (req, res, next) => {
  try {
    const data = await AnalyticsService.getClassCollection(req.schoolId!);
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

router.get('/class-distribution', requirePermission('analytics', 'read'), async (req, res, next) => {
  try {
    const data = await AnalyticsService.getClassDistribution(req.schoolId!);
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

export default router;
