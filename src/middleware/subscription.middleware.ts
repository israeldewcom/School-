import { Request, Response, NextFunction } from 'express';
import { Subscription } from '../models/Subscription';
import { ForbiddenError } from '../utils/errors';
import logger from '../config/logger';
import { getJSON, setJSON, del } from '../config/redis';

export const requireActiveSubscription = async (req: Request, res: Response, next: NextFunction) => {
  // Skip for super admin
  if (req.user?.role === 'SUPER_ADMIN') {
    return next();
  }

  // Skip auth and webhook routes
  if (req.path.startsWith('/api/v1/auth') || req.path.startsWith('/api/v1/webhooks')) {
    return next();
  }

  // Whitelist manual payment endpoints
  if (req.path.match(/^\/api\/v1\/payments\/manual$/) ||
      req.path.match(/^\/api\/v1\/payments\/[a-f0-9]{24}\/approve$/)) {
    return next();
  }

  if (!req.user) return next();

  const schoolId = req.schoolId;
  if (!schoolId) return next(new ForbiddenError('School context missing'));

  try {
    const cacheKey = `sub:status:${schoolId}`;
    let subscription = await getJSON<{ status: string; endDate: string; isTrial: boolean; trialEndDate?: string }>(cacheKey);

    if (!subscription) {
      const subDoc = await Subscription.findOne({ schoolId }).select('status endDate isTrial trialEndDate');
      if (subDoc) {
        subscription = {
          status: subDoc.status,
          endDate: subDoc.endDate.toISOString(),
          isTrial: subDoc.isTrial || false,
          trialEndDate: subDoc.trialEndDate?.toISOString(),
        };
        await setJSON(cacheKey, subscription, 300);
      }
    }

    if (!subscription) {
      return next(new ForbiddenError('No subscription found. Please contact support.'));
    }

    // Check trial expiry first
    if (subscription.isTrial && subscription.trialEndDate) {
      const trialEnd = new Date(subscription.trialEndDate);
      if (trialEnd < new Date()) {
        // Trial expired
        await Subscription.updateOne({ schoolId }, { status: 'EXPIRED', isTrial: false });
        await del(cacheKey);
        return next(new ForbiddenError('Your free trial has expired. Please subscribe to continue.'));
      }
      // Trial is active – allow access, but pass days left to frontend via header
      const daysLeft = Math.ceil((trialEnd.getTime() - Date.now()) / 86400000);
      res.setHeader('X-Trial-Days-Left', daysLeft.toString());
      return next();
    }

    // Normal subscription check
    if (subscription.status !== 'ACTIVE') {
      return next(new ForbiddenError('Subscription expired or inactive. Please renew to access this feature.'));
    }

    if (new Date(subscription.endDate) < new Date()) {
      await Subscription.updateOne({ schoolId }, { status: 'EXPIRED' });
      await del(cacheKey);
      return next(new ForbiddenError('Subscription expired. Please renew.'));
    }

    next();
  } catch (error) {
    logger.error('Subscription middleware error:', error);
    next(new ForbiddenError('Unable to verify subscription status.'));
  }
};

export const invalidateSubscriptionCache = async (schoolId: string) => {
  await del(`sub:status:${schoolId}`);
};
