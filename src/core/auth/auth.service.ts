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

// ------------------------------------------------------------------
// Session configuration
//
// ACCESS_TOKEN_TTL  — short-lived, sent on every request. When it
//                     expires, the frontend silently refreshes using
//                     the refresh token. Users never see this.
//
// REFRESH_TOKEN_TTL — long-lived. Determines how long a user can go
//                     without opening the app before being forced to
//                     log in again.
//
// ABSOLUTE_SESSION_DAYS — hard cap. Set to 0 to disable. When enabled,
//                     every user must re-login N days after their
//                     session began, regardless of activity. Useful
//                     for compliance; causes Monday-morning chaos if
//                     you're not careful.
// ------------------------------------------------------------------
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '90d';   // was 30d
const ABSOLUTE_SESSION_DAYS = 0;   // 0 = disabled. Set to 90 for hard cap.

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

// ------------------------------------------------------------------
// Password verification — supports both legacy bcrypt hashes and
// current argon2 hashes so old accounts log in without a reset.
// ------------------------------------------------------------------
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
// Token helpers
//
// The `expiresIn` option trips @types/jsonwebtoken overload resolution
// because it wants `number | StringValue`, not plain `string`. Casting
// via SignOptions clears the type error without losing safety on the
// rest of the object.
// ------------------------------------------------------------------
function signAccessToken(user: any): string {
  const options: SignOptions = { expiresIn: ACCESS_TOKEN_TTL as any };
  return jwt.sign(
    {
      sub: String(user._id),
      role: user.role,
      schoolId: user.schoolId ? String(user.schoolId) : undefined,
      name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
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
    { sub: String(user._id), type: 'refresh' },
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
    sessionStartedAt: user.sessionStartedAt ? user.sessionStartedAt.toISOString() : null,
  };
}

// ------------------------------------------------------------------
// Service
// ------------------------------------------------------------------
export class AuthService {
  /**
   * Login. Flexible signature so onboarding controllers can pass
   * either a meta object or raw ip + userAgent strings.
   *
   *   login(username, password)
   *   login(username, password, metaObject)
   *   login(username, password, ipString, userAgentString)
   *   login(username, password, metaObject, rememberMe)
   */
  static async login(
    username: string,
    password: string,
    metaOrIp?: any,
    maybeUserAgentOrRemember?: any
  ) {
    if (!username || !password) {
      throw new BadRequestError('Username and password are required');
    }

    // Normalize the trailing args.
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

    // Transparent migration: if we just verified a bcrypt hash, replace
    // it with argon2 so future logins use the newer format.
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
    // "Remember me" off → short-lived 8-hour refresh. On → full 90 days.
    const refreshToken = remember
      ? signRefreshToken(user)
      : signRefreshToken(user, '8h');

    // Keep only the 5 most recent refresh tokens per user. Prevents the
    // array from growing forever across logins.
    user.refreshTokens = [refreshToken, ...(user.refreshTokens || []).slice(0, 4)];

    // Stamp the session start on every login so the absolute cap (when
    // enabled) has a reference point.
    user.sessionStartedAt = new Date();
    user.lastLogin = new Date();
    user.lastLoginAt = new Date();
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

  /**
   * Rotate a refresh token into a new access + refresh pair.
   * Called silently by the frontend when the 15-minute access token
   * expires. Users never see this unless it fails.
   */
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

    const user = await User.findById(payload.sub).select('+password');
    if (!user || !user.isActive) {
      throw new BadRequestError('Account not found or inactive');
    }

    // Token must be one of the stored ones — protects against replay
    // after logout.
    if (!(user.refreshTokens || []).includes(refreshToken)) {
      throw new BadRequestError('Refresh token revoked');
    }

    // Absolute session cap — only enforced when ABSOLUTE_SESSION_DAYS > 0.
    // Forces re-login N days after the session began, regardless of how
    // active the user has been.
    if (ABSOLUTE_SESSION_DAYS > 0 && user.sessionStartedAt) {
      const daysSinceStart =
        (Date.now() - user.sessionStartedAt.getTime()) / 86400000;
      if (daysSinceStart > ABSOLUTE_SESSION_DAYS) {
        user.refreshTokens = [];
        user.sessionStartedAt = undefined;
        await user.save();
        throw new BadRequestError('Session expired. Please sign in again.');
      }
    }

    const newAccess = signAccessToken(user);
    const newRefresh = signRefreshToken(user);

    // Replace the used token with the new one (rotation).
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

  /**
   * Alias — some controllers reference `refreshToken` instead of `refresh`.
   */
  static async refreshToken(refreshToken: string) {
    return AuthService.refresh(refreshToken);
  }

  static async logout(refreshToken: string) {
    if (!refreshToken) return { success: true };
    try {
      const payload: any = jwt.verify(refreshToken, refreshSecret());
      const user = await User.findById(payload.sub);
      if (user) {
        user.refreshTokens = (user.refreshTokens || []).filter((t) => t !== refreshToken);
        // When no tokens remain, this session is over — clear the start
        // marker so the next login gets a fresh 90-day window.
        if (user.refreshTokens.length === 0) {
          user.sessionStartedAt = undefined;
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
    user.sessionStartedAt = undefined;
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
    // Password change ends every existing session on every device.
    user.refreshTokens = [];
    user.sessionStartedAt = undefined;
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

  /**
   * Return how long the current session has left. Frontend uses this
   * to show a warning banner when expiry is close.
   */
  static async sessionStatus(userId: string) {
    if (!mongoose.isValidObjectId(userId)) {
      throw new BadRequestError('Invalid user id');
    }
    const user = await User.findById(userId).select('sessionStartedAt refreshTokens').lean();
    if (!user) throw new NotFoundError('User not found');
    return {
      active: (user.refreshTokens || []).length > 0,
      startedAt: (user as any).sessionStartedAt || null,
      absoluteCapDays: ABSOLUTE_SESSION_DAYS,
      slidingWindowDays: 90,
    };
  }
}
