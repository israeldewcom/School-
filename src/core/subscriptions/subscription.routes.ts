import express from 'express';
import { SubscriptionController } from './subscription.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/plans', requirePermission('subscriptions', 'read'), SubscriptionController.getPlans);
router.get('/', requirePermission('subscriptions', 'read'), SubscriptionController.getSubscriptions);
router.get('/:id', requirePermission('subscriptions', 'read'), SubscriptionController.getSubscription);
router.post('/', requirePermission('subscriptions', 'write'), SubscriptionController.create);
router.put('/:id', requirePermission('subscriptions', 'write'), SubscriptionController.update);
router.post('/:id/cancel', requirePermission('subscriptions', 'write'), SubscriptionController.cancel);

// NEW routes
router.get('/trial-status', requirePermission('subscriptions', 'read'), SubscriptionController.getTrialStatus);
router.post('/renewal/request', requirePermission('subscriptions', 'write'), SubscriptionController.requestRenewal);

// Platform admin routes (super admin only)
router.get('/renewals/pending', requirePermission('platform', 'access'), SubscriptionController.getPendingRenewals);
router.post('/renewals/:id/approve', requirePermission('platform', 'access'), SubscriptionController.approveRenewal);
router.post('/renewals/:id/reject', requirePermission('platform', 'access'), SubscriptionController.rejectRenewal);

export default router;
