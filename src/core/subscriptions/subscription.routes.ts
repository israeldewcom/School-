import express from 'express';
import { SubscriptionController } from './subscription.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/plans', requirePermission('subscriptions', 'read'), SubscriptionController.getPlans);

// Specific/static routes MUST be registered before '/:id' — otherwise Express
// matches them as an :id param and they never reach their real handlers.
router.get('/trial-status', requirePermission('subscriptions', 'read'), SubscriptionController.getTrialStatus);
router.get('/current', requirePermission('subscriptions', 'read'), SubscriptionController.getCurrent);
router.post('/renew', requirePermission('subscriptions', 'write'), SubscriptionController.requestRenewal);
router.post('/sms/topup', requirePermission('subscriptions', 'write'), SubscriptionController.topUpSMS);

// Kept for backwards compatibility with any existing callers of the old path.
router.post('/renewal/request', requirePermission('subscriptions', 'write'), SubscriptionController.requestRenewal);

// Platform admin routes (super admin only) — also static, also before '/:id'.
router.get('/renewals/pending', requirePermission('platform', 'access'), SubscriptionController.getPendingRenewals);
router.post('/renewals/:id/approve', requirePermission('platform', 'access'), SubscriptionController.approveRenewal);
router.post('/renewals/:id/reject', requirePermission('platform', 'access'), SubscriptionController.rejectRenewal);

router.get('/', requirePermission('subscriptions', 'read'), SubscriptionController.getSubscriptions);
router.get('/:id', requirePermission('subscriptions', 'read'), SubscriptionController.getSubscription);
router.post('/', requirePermission('subscriptions', 'write'), SubscriptionController.create);
router.put('/:id', requirePermission('subscriptions', 'write'), SubscriptionController.update);
router.post('/:id/cancel', requirePermission('subscriptions', 'write'), SubscriptionController.cancel);

export default router;
