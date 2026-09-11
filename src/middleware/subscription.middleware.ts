// src/middleware/subscription.middleware.ts
//
// IMPORTANT: this middleware is mounted as router.use(requireActiveSubscription)
// INSIDE the router that itself is mounted at app.use('/api/v1', routes) —
// see src/routes/index.ts. That means req.path here does NOT include the
// '/api/v1' prefix; Express strips it because it's the parent mount path.
// A request to /api/v1/subscriptions/plans arrives here with
// req.path === '/subscriptions/plans'. The whitelist below must match
// against that stripped form, not the full external URL.

import { Request, Response, NextFunction } from 'express';
import { Subscription } from '../models/Subscription';
import { ForbiddenError } from '../utils/errors';
import logger from '../config/logger';
import { getJSON, setJSON, del } from '../config/mongoStore';

export const requireActiveSubscription = async (req: Request, res: Response, next: NextFunction) => {
  // Skip for super admin
  if (req.user?.role === 'SUPER_ADMIN') {
    return next();
  }

  // NOTE: this middleware is only mounted for the block of routes AFTER
  // authMiddleware/requireSchoolMembership/requireSchoolContext in
  // routes/index.ts — auth and webhook routes never reach this file at all,
  // so no path check for them is needed or correct here.

  // Whitelist manual payment endpoints and first-time subscribe/renewal
  // endpoints — these are exactly the routes a school with NO subscription
  // (or an expired one) needs to reach in order to fix that, so they can't
  // be gated behind having an active subscription.
  // Paths here are relative to the '/api/v1' mount (see note above) —
  // e.g. '/subscriptions/plans', NOT '/api/v1/subscriptions/plans'.
  if (req.path.match(/^\/payments\/manual$/) ||
      req.path.match(/^\/payments\/[a-f0-9]{24}\/approve$/) ||
      req.path.match(/^\/subscriptions\/subscribe$/) ||
      req.path.match(/^\/subscriptions\/renew$/) ||
      req.path.match(/^\/subscriptions\/renewal\/request$/) ||
      req.path.match(/^\/subscriptions\/plans$/) ||
      req.path.match(/^\/subscriptions\/current$/) ||
      req.path.match(/^\/subscriptions\/trial-status$/)) {
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
