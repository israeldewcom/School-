// src/core/auth/auth.service.ts
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import argon2 from 'argon2';
import jwt, { SignOptions } from 'jsonwebtoken';
import { User } from '../../models/User';
import { AuditLog } from '../../models/AuditLog';
import * as envConfig from '../../config/env';
import logger from '../../config/logger';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';

const config: any = (envConfig as any).default || envConfig;

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '90d';
const ABSOLUTE_SESSION_DAYS = 0;

function accessSecret(): string {
  return process.env.JWT_SECRET || config.JWT_SECRET || 'change-me-in-env';
}

function refreshSecret(): string {
  return (
    process.env.JWT_REFRESH_SECRET ||
    config.JWT_REFRESH_SECRET ||
    process.env.JWT_SECRET ||
    config.JWT_SECRET ||
    'change-me-in-env'
  );
}

async function verifyPassword(stored: string, candidate: string): Promise<boolean> {
  if (!stored || !candidate) return false;
  try {
    if (stored.startsWith('$argon2')) {
      return await argon2.verify(stored, candidate);
    }
    if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
      return await bcrypt.compare(candidate, stored);
    }
    logger.warn('verifyPassword: unknown hash format encountered');
    return false;
  } catch (err: any) {
    logger.warn(`verifyPassword: comparison threw (${err?.message})`);
    return false;
  }
}

function isLegacyHash(stored: string): boolean {
  return stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$');
}

// ------------------------------------------------------------------
// Token signers
//
// The access token includes `sub`, `id`, and `userId` (all pointing
// at the same value) so any middleware reading any of the three
// conventions gets the right user id. This is deliberately redundant —
// it costs 40 bytes per token and eliminates an entire class of
// "user id is undefined" bugs.
// ------------------------------------------------------------------
function signAccessToken(user: any): string {
  const options: SignOptions = { expiresIn: ACCESS_TOKEN_TTL as any };
  return jwt.sign(
    {
      sub: String(user._id),
      id: String(user._id),
      userId: String(user._id),
      role: user.role,
      schoolId: user.schoolId ? String(user.schoolId) : undefined,
      name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      formClassId: user.formClassId ? String(user.formClassId) : undefined,
      parentId: user.parentId ? String(user.parentId) : undefined,
    },
    accessSecret(),
    options
  );
}

function signRefreshToken(user: any, ttlOverride?: string): string {
  const options: SignOptions = {
    expiresIn: (ttlOverride || REFRESH_TOKEN_TTL) as any,
  };
  return jwt.sign(
    {
      sub: String(user._id),
      id: String(user._id),
      userId: String(user._id),
      type: 'refresh',
    },
    refreshSecret(),
    options
  );
}

function serializeUser(user: any) {
  return {
    id: String(user._id),
    name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    username: user.username,
    role: user.role,
    schoolId: user.schoolId ? String(user.schoolId) : null,
    formClassId: user.formClassId ? String(user.formClassId) : null,
    subjectIds: (user.subjectIds || []).map((s: any) => String(s)),
    parentId: user.parentId ? String(user.parentId) : null,
    sessionStartedAt: (user as any).sessionStartedAt
      ? new Date((user as any).sessionStartedAt).toISOString()
      : null,
  };
}

function getSessionStart(user: any): Date | null {
  const v = (user as any).sessionStartedAt;
  return v ? new Date(v) : null;
}

function setSessionStart(user: any, date: Date | null) {
  (user as any).sessionStartedAt = date;
}

export class AuthService {
  static async login(
    username: string,
    password: string,
    metaOrIp?: any,
    maybeUserAgentOrRemember?: any
  ) {
    if (!username || !password) {
      throw new BadRequestError('Username and password are required');
    }

    let meta: any = {};
    let remember = true;

    if (typeof metaOrIp === 'string') {
      meta = { ip: metaOrIp, userAgent: maybeUserAgentOrRemember };
    } else if (metaOrIp && typeof metaOrIp === 'object') {
      meta = metaOrIp;
      if (typeof maybeUserAgentOrRemember === 'boolean') {
        remember = maybeUserAgentOrRemember;
      }
    }

    const uname = String(username).toLowerCase().trim();
    const user = await User.findOne({ username: uname }).select('+password');
    if (!user) throw new BadRequestError('Invalid username or password');
    if (!user.isActive) {
      const err: any = new Error('This account has been deactivated. Contact your school owner.');
      err.statusCode = 403;
      throw err;
    }

    const ok = await verifyPassword(user.password, password);
    if (!ok) throw new BadRequestError('Invalid username or password');

    if (isLegacyHash(user.password)) {
      try {
        user.password = password;
        await user.save();
        logger.info(`Migrated bcrypt → argon2 hash for ${user.username}`);
      } catch (err: any) {
        logger.warn(`Failed to migrate password hash for ${user.username}: ${err?.message}`);
      }
    }

    const accessToken = signAccessToken(user);
    const refreshToken = remember
      ? signRefreshToken(user)
      : signRefreshToken(user, '8h');

    user.refreshTokens = [refreshToken, ...(user.refreshTokens || []).slice(0, 4)];
    user.lastLogin = new Date();
    user.lastLoginAt = new Date();
    setSessionStart(user, new Date());
    await user.save();

    try {
      await AuditLog.create({
        actor: user.username,
        action: 'auth.login',
        resource: 'User',
        resourceId: user._id,
        after: { ip: meta.ip, ua: meta.userAgent },
      });
    } catch (_) {}

    return {
      accessToken,
      refreshToken,
      user: serializeUser(user),
    };
  }

  static async refresh(refreshToken: string) {
    if (!refreshToken) throw new BadRequestError('Refresh token required');

    let payload: any;
    try {
      payload = jwt.verify(refreshToken, refreshSecret());
    } catch (_) {
      throw new BadRequestError('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh') {
      throw new BadRequestError('Invalid token type');
    }

    const userId = payload.sub || payload.id || payload.userId;
    if (!userId) throw new BadRequestError('Malformed refresh token');

    const user = await User.findById(userId).select('+password');
    if (!user || !user.isActive) {
      throw new BadRequestError('Account not found or inactive');
    }

    if (!(user.refreshTokens || []).includes(refreshToken)) {
      throw new BadRequestError('Refresh token revoked');
    }

    if (ABSOLUTE_SESSION_DAYS > 0) {
      const startedAt = getSessionStart(user);
      if (startedAt) {
        const daysSinceStart = (Date.now() - startedAt.getTime()) / 86400000;
        if (daysSinceStart > ABSOLUTE_SESSION_DAYS) {
          user.refreshTokens = [];
          setSessionStart(user, null);
          await user.save();
          throw new BadRequestError('Session expired. Please sign in again.');
        }
      }
    }

    const newAccess = signAccessToken(user);
    const newRefresh = signRefreshToken(user);

    user.refreshTokens = [
      newRefresh,
      ...(user.refreshTokens || []).filter((t) => t !== refreshToken).slice(0, 4),
    ];
    await user.save();

    return {
      accessToken: newAccess,
      refreshToken: newRefresh,
      user: serializeUser(user),
    };
  }

  static async refreshToken(refreshToken: string) {
    return AuthService.refresh(refreshToken);
  }

  static async logout(refreshToken: string) {
    if (!refreshToken) return { success: true };
    try {
      const payload: any = jwt.verify(refreshToken, refreshSecret());
      const userId = payload.sub || payload.id || payload.userId;
      if (!userId) return { success: true };
      const user = await User.findById(userId);
      if (user) {
        user.refreshTokens = (user.refreshTokens || []).filter((t) => t !== refreshToken);
        if (user.refreshTokens.length === 0) {
          setSessionStart(user, null);
        }
        await user.save();
      }
    } catch (_) {}
    return { success: true };
  }

  static async logoutAll(userId: string) {
    if (!mongoose.isValidObjectId(userId)) {
      throw new BadRequestError('Invalid user id');
    }
    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User not found');
    user.refreshTokens = [];
    setSessionStart(user, null);
    await user.save();
    return { success: true };
  }

  static async changePassword(userId: string, oldPassword: string, newPassword: string) {
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestError('New password must be at least 6 characters');
    }
    const user = await User.findById(userId).select('+password');
    if (!user) throw new NotFoundError('User not found');

    const ok = await verifyPassword(user.password, oldPassword);
    if (!ok) throw new BadRequestError('Current password is incorrect');

    user.password = newPassword;
    user.refreshTokens = [];
    setSessionStart(user, null);
    await user.save();

    try {
      await AuditLog.create({
        actor: user.username,
        action: 'auth.password_changed',
        resource: 'User',
        resourceId: user._id,
      });
    } catch (_) {}

    return { success: true };
  }

  static async sessionStatus(userId: string) {
    if (!mongoose.isValidObjectId(userId)) {
      throw new BadRequestError('Invalid user id');
    }
    const user = await User.findById(userId)
      .select('sessionStartedAt refreshTokens')
      .lean();
    if (!user) throw new NotFoundError('User not found');
    const startedAt = (user as any).sessionStartedAt || null;
    return {
      active: ((user as any).refreshTokens || []).length > 0,
      startedAt,
      absoluteCapDays: ABSOLUTE_SESSION_DAYS,
      slidingWindowDays: 90,
    };
  }
}
