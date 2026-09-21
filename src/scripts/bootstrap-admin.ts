// src/scripts/bootstrap-admin.ts
import mongoose from 'mongoose';
import { User } from '../models/User';
import logger from '../config/logger';

const DEFAULT_ADMIN_EMAIL = 'israeldewa1@gmail.com';
const DEFAULT_ADMIN_PASSWORD = 'qwertyui';

export async function bootstrapAdmin(): Promise<void> {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL)
    .toLowerCase()
    .trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  const username = (process.env.BOOTSTRAP_ADMIN_USERNAME || email.split('@')[0])
    .toLowerCase()
    .trim();
  const displayName = 'Platform Admin';

  if (!email || !password) {
    logger.warn('bootstrapAdmin: missing email or password, skipping');
    return;
  }

  try {
    // Explicitly type as any — Mongoose's chained query types differ
    // between findOne, findOne().select(...), and the new User(...)
    // constructor, and TypeScript can't unify them without help.
    let user: any = await User.findOne({ email }).select('+password');
    if (!user) {
      user = await User.findOne({ username }).select('+password');
    }

    if (!user) {
      user = new User({
        username,
        email,
        password,           // plaintext — hashed by User.ts pre-save hook
        name: displayName,
        firstName: 'Platform',
        lastName: 'Admin',
        role: 'SUPER_ADMIN',
        isActive: true,
        refreshTokens: [],
      });
      await user.save();
      logger.info(`✅ Super admin created: ${email} (username: ${username})`);
      return;
    }

    let changed = false;

    if (user.role !== 'SUPER_ADMIN') {
      user.role = 'SUPER_ADMIN';
      changed = true;
      logger.info(`bootstrapAdmin: promoted ${email} to SUPER_ADMIN`);
    }
    if (!user.isActive) {
      user.isActive = true;
      changed = true;
      logger.info(`bootstrapAdmin: reactivated ${email}`);
    }

    const passwordMatches = await user.comparePassword(password);
    if (!passwordMatches) {
      user.password = password;   // pre-save hook rehashes with argon2
      changed = true;
      logger.info(`bootstrapAdmin: reset password for ${email}`);
    }

    if (changed) {
      await user.save();
    } else {
      logger.info(`bootstrapAdmin: super admin ready (${email})`);
    }
  } catch (err: any) {
    logger.error(`bootstrapAdmin: failed — ${err?.message}`, { stack: err?.stack });
  }
}

export default bootstrapAdmin;
