import express from 'express';
import { PlatformController } from './platform.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.use(authMiddleware);
router.use(requirePermission('platform', 'access'));

router.get('/schools', PlatformController.listSchools);
router.get('/subscriptions', PlatformController.listSubscriptions);
router.post('/subscriptions/update', PlatformController.updateSubscription);
router.get('/analytics', PlatformController.getGlobalAnalytics);

export default router;
