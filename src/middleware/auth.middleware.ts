import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { redis, getJSON, del } from '../config/redis';
import { env } from '../config/env';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import logger from '../config/logger';

declare global {
  namespace Express {
    interface Request {
      user?: any;
      userId?: string;
      schoolId?: string;
      token?: string;
      sessionId?: string;
    }
  }
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.split(' ')[1];
    req.token = token;

    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as { userId: string; jti: string };
    req.sessionId = decoded.jti;

    const blacklisted = await redis.get(`blacklist:${token}`);
    if (blacklisted) {
      throw new UnauthorizedError('Token revoked');
    }

    const sessionData = await getJSON<{ userId: string; schoolId?: string }>(`session:${decoded.jti}`);
    if (!sessionData) {
      throw new UnauthorizedError('Session expired');
    }
    if (sessionData.userId !== decoded.userId) {
      throw new UnauthorizedError('Invalid session');
    }

    const user = await User.findById(decoded.userId)
      .select('-password -refreshTokens')
      .populate('schoolId', 'name slug status');
    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found or inactive');
    }

    req.user = user;
    req.userId = user._id.toString();
    req.schoolId = sessionData.schoolId || user.schoolId?._id?.toString() || undefined;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token'));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token expired'));
    } else {
      next(error);
    }
  }
};

export const requireSchoolMembership = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  if (req.user.role === 'SUPER_ADMIN') {
    const overrideSchoolId = req.headers['x-school-id'] as string;
    if (overrideSchoolId) {
      req.schoolId = overrideSchoolId;
      logger.info(`Super admin ${req.user.email} accessing school ${overrideSchoolId}`);
    }
    return next();
  }

  if (!req.schoolId) {
    return next(new ForbiddenError('No school context available'));
  }

  const userSchoolId = req.user.schoolId?._id?.toString();
  if (userSchoolId && userSchoolId !== req.schoolId) {
    return next(new ForbiddenError('You do not have access to this school'));
  }

  next();
};

export const requireSchoolContext = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.schoolId) {
    return next(new ForbiddenError('School context required'));
  }
  next();
};

// Refresh token theft detection and revocation
export const revokeRefreshTokenFamily = async (userId: string, sessionId: string): Promise<void> => {
  // Remove all refresh tokens for this user and blacklist all associated sessions
  const user = await User.findById(userId);
  if (!user) return;
  user.refreshTokens = [];
  await user.save();

  const sessionIds = await redis.smembers(`user:sessions:${userId}`);
  for (const sid of sessionIds) {
    await del(`session:${sid}`);
  }
  await redis.del(`user:sessions:${userId}`);
  logger.warn(`Revoked all sessions for user ${userId} due to possible token theft`);
};
