 // src/core/auth/auth.service.ts
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { User } from '../../models/User';
import { School } from '../../models/School';
import { AuditLog } from '../../models/AuditLog';
import config from '../../config/env';
import logger from '../../config/logger';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';

// ------------------------------------------------------------------
// Config
// ------------------------------------------------------------------
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '30d';
const REFRESH_TTL_DAYS = 30;

function accessSecret(): string {
  return process.env.JWT_SECRET || (config as any).JWT_SECRET || 'change-me-in-env';
}
function refreshSecret(): string {
  return process.env.JWT_REFRESH_SECRET
    || (config as any).JWT_REFRESH_SECRET
    || process.env.JWT_SECRET
    || 'change-me-in-env';
}

// ------------------------------------------------------------------
// Password helpers — support both hashers
// ------------------------------------------------------------------

/**
 * Verify a plaintext password against a stored hash. Detects which
 * hasher produced the hash by its prefix so old bcrypt accounts and
 * new argon2 accounts both authenticate.
 *
 *   $2a$…, $2b$…, $2y$…  → bcrypt
 *   $argon2…              → argon2
 */
async function verifyPassword(stored: string, candidate: string): Promise<boolean> {
  if (!stored || !candidate) return false;
  try {
    if (stored.startsWith('$argon2')) {
      return await argon2.verify(stored, candidate);
    }
    if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
      return await bcrypt.compare(candidate, stored);
    }
    // Unknown format — refuse rather than guess.
    logger.warn('verifyPassword: unknown hash format encountered');
    return false;
  } catch (err: any) {
    logger.warn(`verifyPassword: comparison threw (${err?.message})`);
    return false;
  }
}

/**
 * True if the stored hash is bcrypt — used to re-hash on successful
 * login so accounts migrate to argon2 without user action.
 */
function isLegacyHash(stored: string): boolean {
  return stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$');
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

function signRefreshToken(user: any): string {
  return jwt.sign(
    { sub: String(user._id), type: 'refresh' },
    refreshSecret(),
    { expiresIn: REFRESH_TOKEN_TTL }
  );
}

function computeRefreshExpiry(): Date {
  return new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
}

// ------------------------------------------------------------------
// Service
// ------------------------------------------------------------------
export class AuthService {
  /**
   * Username + password login. Handles legacy bcrypt hashes,
   * upgrades them to argon2 on success, and rotates refresh tokens.
   */
  static async login(username: string, password: string, meta: any = {}) {
    if (!username || !password) {
      throw new BadRequestError('Username and password are required');
    }

    const uname = String(username).toLowerCase().trim();

    // select('+password') because the schema marks it select:false.
    const user = await User.findOne({ username: uname }).select('+password');
    if (!user) {
      // Same error message for missing user and bad password — avoids
      // leaking which usernames exist.
      throw new BadRequestError('Invalid username or password');
    }
    if (!user.isActive) {
      const err: any = new Error('This account has been deactivated. Contact your school owner.');
      err.statusCode = 403;
      throw err;
    }

    const ok = await verifyPassword(user.password, password);
    if (!ok) {
      throw new BadRequestError('Invalid username or password');
    }

    // Transparent migration: if we just verified a bcrypt hash, replace
    // it with argon2 so future logins are faster and the storage format
    // is uniform.
    if (isLegacyHash(user.password)) {
      try {
        user.password = password;            // pre-save hook rehashes with argon2
        await user.save();
        logger.info(`Migrated bcrypt → argon2 hash for ${user.username}`);
      } catch (err: any) {
        // Migration failing shouldn't break login — the user already
        // authenticated successfully.
        logger.warn(`Failed to migrate password hash for ${user.username}: ${err?.message}`);
      }
    }

    // Issue tokens.
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    // Persist the refresh token (bounded to the last 5 active sessions).
    user.refreshTokens = [refreshToken, ...(user.refreshTokens || []).slice(0, 4)];
    user.lastLogin = new Date();
    user.lastLoginAt = new Date();
    await user.save();

    // Audit — best-effort, ignore failures.
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
      user: {
        id: String(user._id),
        name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        username: user.username,
        role: user.role,
        schoolId: user.schoolId ? String(user.schoolId) : null,
        formClassId: user.formClassId ? String(user.formClassId) : null,
        subjectIds: (user.subjectIds || []).map((s) => String(s)),
        parentId: user.parentId ? String(user.parentId) : null,
      },
    };
  }

  /**
   * Rotate a refresh token into a new access + refresh pair. Called by
   * the frontend when a request returns 401.
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

    // Token must be one of the stored ones (prevents replay after logout).
    if (!(user.refreshTokens || []).includes(refreshToken)) {
      throw new BadRequestError('Refresh token revoked');
    }

    const newAccess = signAccessToken(user);
    const newRefresh = signRefreshToken(user);

    // Replace the old token with the new one (rotation).
    user.refreshTokens = [
      newRefresh,
      ...(user.refreshTokens || []).filter((t) => t !== refreshToken).slice(0, 4),
    ];
    await user.save();

    return {
      accessToken: newAccess,
      refreshToken: newRefresh,
      user: {
        id: String(user._id),
        name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        username: user.username,
        role: user.role,
        schoolId: user.schoolId ? String(user.schoolId) : null,
        formClassId: user.formClassId ? String(user.formClassId) : null,
        subjectIds: (user.subjectIds || []).map((s) => String(s)),
        parentId: user.parentId ? String(user.parentId) : null,
      },
    };
  }

  /**
   * Log out — remove the specific refresh token from the stored list.
   * Idempotent: logging out with a token that isn't stored still
   * returns success so the frontend never gets stuck.
   */
  static async logout(refreshToken: string) {
    if (!refreshToken) return { success: true };
    try {
      const payload: any = jwt.verify(refreshToken, refreshSecret());
      const user = await User.findById(payload.sub);
      if (user) {
        user.refreshTokens = (user.refreshTokens || []).filter((t) => t !== refreshToken);
        await user.save();
      }
    } catch (_) {
      // Ignore — logged out is logged out.
    }
    return { success: true };
  }

  /**
   * Log out everywhere — clear every stored refresh token for this user.
   */
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

  /**
   * Change own password — verifies the old one first.
   */
  static async changePassword(userId: string, oldPassword: string, newPassword: string) {
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestError('New password must be at least 6 characters');
    }
    const user = await User.findById(userId).select('+password');
    if (!user) throw new NotFoundError('User not found');

    const ok = await verifyPassword(user.password, oldPassword);
    if (!ok) throw new BadRequestError('Current password is incorrect');

    user.password = newPassword;
    user.refreshTokens = []; // end every other session
    await user.save();

    // Audit — best-effort.
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
