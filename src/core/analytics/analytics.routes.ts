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

export default router;
