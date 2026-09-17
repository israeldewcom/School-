// src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User } from '../models/User';
import logger from '../config/logger';

function accessSecret(): string {
  return process.env.JWT_SECRET || 'change-me-in-env';
}

/**
 * Authentication middleware.
 *
 * Reads the user id from any of `sub`, `id`, or `userId` in the JWT
 * payload so it works regardless of which convention the token signer
 * used. Attaches the full user document to req.user plus the derived
 * fields (userId, userRole, schoolId) that downstream services read.
 *
 * Never assumes a field exists. Any missing field results in a clean
 * 401/403, not a 500.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = String(req.headers.authorization || '');
    if (!header.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const token = header.slice(7).trim();
    if (!token) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    let payload: any;
    try {
      payload = jwt.verify(token, accessSecret());
    } catch (err: any) {
      const msg = err?.name === 'TokenExpiredError'
        ? 'Token expired'
        : 'Invalid authentication token';
      res.status(401).json({ success: false, message: msg });
      return;
    }

    // Extract the user id from any of the three conventions.
    const userId = payload?.sub || payload?.id || payload?.userId;
    if (!userId || !mongoose.isValidObjectId(userId)) {
      res.status(401).json({ success: false, message: 'Malformed token' });
      return;
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      res.status(401).json({ success: false, message: 'User not found' });
      return;
    }
    if (!(user as any).isActive) {
      res.status(403).json({
        success: false,
        message: 'This account has been deactivated. Contact your school owner.',
      });
      return;
    }

    // Attach everything downstream code might read. The full user doc
    // is present for services that need fields like formClassId or
    // subjectIds, and the individual convenience fields are present so
    // no service has to dig through req.user to find them.
    (req as any).user = user;
    (req as any).userId = String((user as any)._id);
    (req as any).userRole = (user as any).role;
    (req as any).schoolId = (user as any).schoolId
      ? String((user as any).schoolId)
      : undefined;

    next();
  } catch (err: any) {
    logger.error(`authMiddleware: unexpected failure — ${err?.message}`, { stack: err?.stack });
    res.status(500).json({ success: false, message: 'Authentication error' });
  }
}

/**
 * Requires the authenticated user to have a school context. Runs after
 * authMiddleware. Used to gate every school-scoped route.
 */
export async function requireSchoolMembership(req: Request, res: Response, next: NextFunction): Promise<void> {
  const role = (req as any).userRole;
  if (role === 'SUPER_ADMIN') {
    // Super admin has no school context but can hit platform routes
    // which are mounted separately. If they reach here, deny.
    res.status(403).json({ success: false, message: 'No school membership' });
    return;
  }
  if (!(req as any).schoolId) {
    res.status(403).json({ success: false, message: 'No school membership' });
    return;
  }
  next();
}

/**
 * Same shape as requireSchoolMembership — kept as a separate export so
 * existing imports don't break. In this codebase the two middlewares
 * do the same job.
 */
export async function requireSchoolContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!(req as any).schoolId) {
    res.status(403).json({ success: false, message: 'No school context' });
    return;
  }
  next();
}

/**
 * Optional middleware — attaches the user to req if a valid token is
 * present, but never blocks the request. Useful for endpoints that
 * behave differently for logged-in vs anonymous callers.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = String(req.headers.authorization || '');
    if (!header.startsWith('Bearer ')) return next();

    const token = header.slice(7).trim();
    if (!token) return next();

    let payload: any;
    try {
      payload = jwt.verify(token, accessSecret());
    } catch (_) {
      return next();
    }

    const userId = payload?.sub || payload?.id || payload?.userId;
    if (!userId || !mongoose.isValidObjectId(userId)) return next();

    const user = await User.findById(userId).lean();
    if (!user || !(user as any).isActive) return next();

    (req as any).user = user;
    (req as any).userId = String((user as any)._id);
    (req as any).userRole = (user as any).role;
    (req as any).schoolId = (user as any).schoolId
      ? String((user as any).schoolId)
      : undefined;
  } catch (_) {}
  next();
}
