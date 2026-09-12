import express from 'express';
import { PlatformController } from './platform.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.use(authMiddleware);
router.use(requirePermission('platform', 'access'));

// Static/specific routes before any ':id' routes.
router.get('/analytics', PlatformController.getGlobalAnalytics);
router.get('/analytics/revenue', PlatformController.getRevenueAnalytics);
router.get('/subscriptions', PlatformController.listSubscriptions);
router.post('/subscriptions/update', PlatformController.updateSubscription);

router.get('/schools', PlatformController.listSchools);
router.get('/schools/:id/detail', PlatformController.getSchoolDetail);
router.post('/schools/:id/extend', PlatformController.extendSubscription);
router.put('/schools/:id/toggle', PlatformController.toggleSchoolStatus);

export default router;
