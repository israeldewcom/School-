// src/middleware/subscription.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { Subscription } from '../models/Subscription';
import logger from '../config/logger';

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<string, { ok: boolean; expires: number }>();

/**
 * Blocks school-scoped requests when the school's subscription is
 * inactive.
 *
 * Exceptions:
 *   - SCHOOL_OWNER and SUPER_ADMIN are always allowed through so they
 *     can reach the Subscription page to renew.
 *   - If the lookup itself fails (database hiccup, etc.), the request
 *     is allowed through rather than 500ing. A subscription check
 *     failing shouldn't take the whole API down.
 */
export async function requireActiveSubscription(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const schoolId = (req as any).schoolId;
  if (!schoolId) {
    res.status(403).json({ success: false, message: 'No school context' });
    return;
  }

  const role = (req as any).userRole;
  if (role === 'SCHOOL_OWNER' || role === 'SUPER_ADMIN') {
    next();
    return;
  }

  try {
    const cached = cache.get(schoolId);
    if (cached && cached.expires > Date.now()) {
      if (cached.ok) {
        next();
        return;
      }
      res.status(402).json({
        success: false,
        message: 'Subscription expired. Contact your school owner.',
      });
      return;
    }

    const sub = await Subscription.findOne({ schoolId })
      .sort({ createdAt: -1 })
      .lean();

    const active = !!sub && ['ACTIVE', 'TRIAL'].includes((sub as any).status);
    cache.set(schoolId, { ok: active, expires: Date.now() + CACHE_TTL_MS });

    if (active) {
      next();
      return;
    }

    res.status(402).json({
      success: false,
      message: 'Subscription expired. Contact your school owner.',
    });
  } catch (err: any) {
    // Fail open — never block the API on a lookup failure.
    logger.error(`requireActiveSubscription: lookup failed — ${err?.message}`, {
      stack: err?.stack,
    });
    next();
  }
}

export async function invalidateSubscriptionCache(schoolId: string): Promise<void> {
  cache.delete(schoolId);
}

export function clearSubscriptionCache(): void {
  cache.clear();
}
