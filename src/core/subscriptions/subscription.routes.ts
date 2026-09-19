// src/core/subscriptions/subscription.routes.ts
import express from 'express';
import { SubscriptionController } from './subscription.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/current', requirePermission('subscriptions', 'read'), SubscriptionController.getCurrent);
router.get('/plans', SubscriptionController.listPlans);
router.get('/trial-status', requirePermission('subscriptions', 'read'), SubscriptionController.trialStatus);

router.post('/renew', requirePermission('subscriptions', 'renew'), SubscriptionController.renew);
router.post('/subscribe', requirePermission('subscriptions', 'write'), SubscriptionController.subscribe);
router.post('/sms/topup', requirePermission('subscriptions', 'write'), SubscriptionController.topupSms);

export default router;
