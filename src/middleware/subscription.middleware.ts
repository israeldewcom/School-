import { Request, Response, NextFunction } from 'express';
import { Subscription } from '../models/Subscription';
import { ForbiddenError } from '../utils/errors';
import logger from '../config/logger';
import { getJSON, setJSON, del } from '../config/redis';

export const requireActiveSubscription = async (req: Request, _res: Response, next: NextFunction) => {
  // Skip for super admin
  if (req.user?.role === 'SUPER_ADMIN') {
    return next();
  }

  // Skip auth and webhook routes
  if (req.path.startsWith('/api/v1/auth') || req.path.startsWith('/api/v1/webhooks')) {
    return next();
  }

  // Whitelist manual payment endpoints to avoid deadlock
  if (req.path.match(/^\/api\/v1\/payments\/manual$/) ||
      req.path.match(/^\/api\/v1\/payments\/[a-f0-9]{24}\/approve$/)) {
    return next();
  }

  // If user is not yet authenticated, let auth middleware handle it
  if (!req.user) {
    return next();
  }

  const schoolId = req.schoolId;
  if (!schoolId) {
    return next(new ForbiddenError('School context missing'));
  }

  try {
    // Check cache first (5-minute TTL)
    const cacheKey = `sub:status:${schoolId}`;
    let subscription = await getJSON<{ status: string; endDate: string }>(cacheKey);

    if (!subscription) {
      const subDoc = await Subscription.findOne({ schoolId }).select('status endDate');
      if (subDoc) {
        subscription = { status: subDoc.status, endDate: subDoc.endDate.toISOString() };
        await setJSON(cacheKey, subscription, 300); // 5 minutes
      }
    }

    if (!subscription || subscription.status !== 'ACTIVE') {
      return next(new ForbiddenError('Subscription expired or inactive. Please renew to access this feature.'));
    }

    // Double-check endDate
    if (new Date(subscription.endDate) < new Date()) {
      // Update cache and DB if expired
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

// Helper to invalidate subscription cache on renewal
export const invalidateSubscriptionCache = async (schoolId: string) => {
  await del(`sub:status:${schoolId}`);
};
