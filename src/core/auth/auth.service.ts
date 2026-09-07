import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { User } from '../../models/User';
import { School } from '../../models/School';
import { redis, setJSON, del } from '../../config/redis';
import { env } from '../../config/env';
import { UnauthorizedError } from '../../utils/errors';
import logger from '../../config/logger';

export class AuthService {
  static async login(email: string, password: string, ip?: string, userAgent?: string) {
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account deactivated');
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    let schoolId = user.schoolId?.toString();
    if (user.schoolId) {
      const school = await School.findById(user.schoolId);
      if (!school || school.status !== 'ACTIVE') {
        throw new UnauthorizedError('School is not active');
      }
      schoolId = school._id.toString();
    }

    const sessionId = randomBytes(16).toString('hex');
    const accessToken = this.generateAccessToken(user._id.toString(), sessionId);
    const refreshToken = this.generateRefreshToken(user._id.toString(), sessionId);

    const refreshHash = await this.hashToken(refreshToken);
    user.refreshTokens.push(refreshHash);
    if (user.refreshTokens.length > 10) {
      user.refreshTokens = user.refreshTokens.slice(-5);
    }
    user.lastLogin = new Date();
    await user.save();

    await setJSON(`session:${sessionId}`, {
      userId: user._id.toString(),
      schoolId,
      ip,
      userAgent,
      createdAt: new Date().toISOString(),
    }, 60 * 60 * 24 * 7);

    await redis.sadd(`user:sessions:${user._id}`, sessionId);

    logger.info(`User ${user.email} logged in (session ${sessionId})`);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        schoolId: user.schoolId,
      },
    };
  }

  static async refreshToken(refreshToken: string) {
    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
    } catch (error) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found');
    }

    const refreshHash = await this.hashToken(refreshToken);
    if (!user.refreshTokens.includes(refreshHash)) {
      // Possible token theft: revoke all sessions
      await this.revokeTokenFamily(user._id.toString(), decoded.jti);
      throw new UnauthorizedError('Refresh token reused, possible theft');
    }

    // Remove old token, generate new ones
    user.refreshTokens = user.refreshTokens.filter((t) => t !== refreshHash);
    const sessionId = decoded.jti || randomBytes(16).toString('hex');
    const newRefreshToken = this.generateRefreshToken(user._id.toString(), sessionId);
    const newHash = await this.hashToken(newRefreshToken);
    user.refreshTokens.push(newHash);
    await user.save();

    const newAccessToken = this.generateAccessToken(user._id.toString(), sessionId);

    // Update session TTL
    const schoolId = user.schoolId?.toString();
    await setJSON(`session:${sessionId}`, {
      userId: user._id.toString(),
      schoolId,
    }, 60 * 60 * 24 * 7);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  static async logout(userId: string, refreshToken: string, accessToken: string) {
    const user = await User.findById(userId);
    if (!user) return;

    const refreshHash = await this.hashToken(refreshToken);
    user.refreshTokens = user.refreshTokens.filter((t) => t !== refreshHash);
    await user.save();

    await redis.set(`blacklist:${accessToken}`, 'true', 'EX', 60 * 15);

    try {
      const decoded = jwt.verify(accessToken, env.JWT_ACCESS_SECRET) as any;
      if (decoded.jti) {
        await del(`session:${decoded.jti}`);
        await redis.srem(`user:sessions:${userId}`, decoded.jti);
      }
    } catch (e) {
      // ignore
    }

    logger.info(`User ${user.email} logged out`);
  }

  static async logoutAll(userId: string) {
    const user = await User.findById(userId);
    if (!user) return;
    user.refreshTokens = [];
    await user.save();

    const sessionIds = await redis.smembers(`user:sessions:${userId}`);
    for (const sid of sessionIds) {
      await del(`session:${sid}`);
    }
    await redis.del(`user:sessions:${userId}`);

    logger.info(`User ${user.email} logged out from all devices`);
  }

  private static generateAccessToken(userId: string, sessionId: string): string {
    return jwt.sign(
      { userId, jti: sessionId },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRY as any }
    );
  }

  private static generateRefreshToken(userId: string, sessionId: string): string {
    return jwt.sign(
      { userId, jti: sessionId },
      env.JWT_REFRESH_SECRET,
      { expiresIn: env.JWT_REFRESH_EXPIRY as any }
    );
  }

  private static async hashToken(token: string): Promise<string> {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private static async revokeTokenFamily(userId: string, _sessionId: string): Promise<void> {
    const user = await User.findById(userId);
    if (user) {
      user.refreshTokens = [];
      await user.save();
    }
    const sessionIds = await redis.smembers(`user:sessions:${userId}`);
    for (const sid of sessionIds) {
      await del(`session:${sid}`);
    }
    await redis.del(`user:sessions:${userId}`);
    logger.warn(`Revoked all sessions for user ${userId} due to possible token theft`);
  }
}
