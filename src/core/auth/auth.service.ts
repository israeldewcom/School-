 // src/core/auth/auth.service.ts
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { User } from '../../models/User';
import { AuditLog } from '../../models/AuditLog';
import * as envConfig from '../../config/env';
import logger from '../../config/logger';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';

// Normalize the env module — supports both `export default {}` and named exports.
const config: any = (envConfig as any).default || envConfig;

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '30d';
const REFRESH_TTL_DAYS = 30;

function accessSecret(): string {
  return (
    process.env.JWT_SECRET ||
    config.JWT_SECRET ||
    'change-me-in-env'
  );
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
// Password verification — supports bcrypt and argon2
// ------------------------------------------------------------------
async function verifyPassword(stored: string, candidate: string): Promise<boolean> {
  if (!stored || !candidate) return false;
  try {
    if (stored.startsWith('$argon2')) {
      return await argon2.verify(stored, candidate);
    }
    if (
      stored.startsWith('$2a$') ||
      stored.startsWith('$2b$') ||
      stored.startsWith('$2y$')
    ) {
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
  return (
    stored.startsWith('$2a$') ||
    stored.startsWith('$2b$') ||
    stored.startsWith('$2y$')
  );
}

// ------------------------------------------------------------------
// Token helpers
// ------------------------------------------------------------------
function signAccessToken(user: any): string {
  return jwt.sign(
    {
      sub: String(user._id),
      role: user.role,
      schoolId: user.schoolId ? String(user.schoolId) : undefined,
      name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    },
    accessSecret(),
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

function signRefreshToken(user: any, ttlOverride?: string): string {
  return jwt.sign(
    { sub: String(user._id), type: 'refresh' },
    refreshSecret(),
    { expiresIn: ttlOverride || REFRESH_TOKEN_TTL }
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
  };
}

// ------------------------------------------------------------------
// Service
// ------------------------------------------------------------------
export class AuthService {
  /**
   * Login. Flexible signature:
   *   login(username, password)
   *   login(username, password, { ip, userAgent })
   *   login(username, password, ipString, userAgentString)
   *   login(username, password, meta, remember)
   *
   * The 4-argument form is what school.controller.ts uses when it
   * auto-logs a new owner in after onboarding.
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

    // Normalize the trailing args into { meta, remember }.
    let meta: any = {};
    let remember = true;

    if (typeof metaOrIp === 'string') {
      // (username, password, ip, userAgent)
      meta = { ip: metaOrIp, userAgent: maybeUserAgentOrRemember };
    } else if (metaOrIp && typeof metaOrIp === 'object') {
      // (username, password, metaObject)
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

    // Transparent migration of bcrypt → argon2.
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
   * Rotate a refresh token. Named `refresh` internally; aliased below
   * as `refreshToken` so callers using either name compile.
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

    if (!(user.refreshTokens || []).includes(refreshToken)) {
      throw new BadRequestError('Refresh token revoked');
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
}
