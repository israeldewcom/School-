// src/core/subscriptions/subscription.routes.ts
import express, { Request, Response, NextFunction } from 'express';
import { SubscriptionController } from './subscription.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

/**
 * Manual SMS top-up credits a school WITHOUT taking payment, so it must be a
 * platform (SUPER_ADMIN) action only.
 */
function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const role = (req as any).userRole || (req as any).user?.role;
  if (role !== 'SUPER_ADMIN') {
    res.status(403).json({
      success: false,
      message: 'Only the SchoolFlow team can credit SMS balance directly. Please contact support to buy credits.',
    });
    return;
  }
  next();
}

router.get('/current', requirePermission('subscriptions', 'read'), SubscriptionController.getCurrent);
router.get('/plans', SubscriptionController.listPlans);
router.get('/trial-status', requirePermission('subscriptions', 'read'), SubscriptionController.trialStatus);

// Balance + low-balance flag, readable by owner AND admin.
router.get('/sms/balance', requirePermission('subscriptions', 'read'), SubscriptionController.smsBalance);

router.post('/renew', requirePermission('subscriptions', 'renew'), SubscriptionController.renew);
router.post('/subscribe', requirePermission('subscriptions', 'write'), SubscriptionController.subscribe);
router.post('/sms/topup', requirePermission('subscriptions', 'write'), requireSuperAdmin, SubscriptionController.topupSms);

export default router;
