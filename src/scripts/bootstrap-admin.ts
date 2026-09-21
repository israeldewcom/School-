// src/scripts/bootstrap-admin.ts
import mongoose from 'mongoose';
import { User } from '../models/User';
import logger from '../config/logger';

/**
 * Bootstrap the platform super admin account.
 *
 * Runs on every server start. Idempotent:
 *   - If no user exists with the admin email → creates one.
 *   - If a user exists → ensures their role is SUPER_ADMIN, they are
 *     active, and their password matches the configured value.
 *
 * Credentials come from env vars so you can rotate them without
 * touching code:
 *   BOOTSTRAP_ADMIN_EMAIL
 *   BOOTSTRAP_ADMIN_PASSWORD
 *   BOOTSTRAP_ADMIN_USERNAME (optional — defaults to the email prefix)
 *
 * If those env vars aren't set, the defaults below are used. Change
 * them in production.
 */
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
    // Look up by email first (the canonical identifier), fall back to
    // username in case the account was created without an email.
    let user = await User.findOne({ email }).select('+password');
    if (!user) {
      user = await User.findOne({ username }).select('+password');
    }

    if (!user) {
      // Create from scratch. The pre-save hook hashes the password.
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

    // User exists — make sure it's still set up correctly. This is the
    // self-healing part: if someone accidentally changed the role or
    // deactivated the account, the next server start fixes it.
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

    // Verify the password matches. Only re-hash if it's different —
    // otherwise every server restart would rewrite the hash and
    // invalidate nothing in particular but churn the document.
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
    // Never crash the server because of this. Log it and move on.
    logger.error(`bootstrapAdmin: failed — ${err?.message}`, { stack: err?.stack });
  }
}

export default bootstrapAdmin;
