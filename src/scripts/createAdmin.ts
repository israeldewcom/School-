import { User } from '../models/User';
import { connectDB } from '../config/database';
import logger from '../config/logger';
import { env } from '../config/env';

(async () => {
  await connectDB();

  const email = env.ADMIN_EMAIL || 'admin@schoolflow.com';
  const existing = await User.findOne({ email });
  if (existing) {
    logger.info(`Admin ${email} already exists.`);
    process.exit(0);
  }

  const password = Math.random().toString(36).slice(-12) + 'A1!';

  // IMPORTANT: do NOT hash here. The User model's pre('save') hook hashes
  // the password. Hashing here would double-hash and lock the account.
  await User.create({
    email,
    username: 'admin',
    password,
    firstName: 'Super',
    lastName: 'Admin',
    role: 'SUPER_ADMIN',
    isActive: true,
  });

  logger.info(`Admin created: ${email}, password: ${password} (save this!)`);
  process.exit(0);
})().catch((err) => {
  logger.error('createAdmin failed:', err);
  process.exit(1);
});
