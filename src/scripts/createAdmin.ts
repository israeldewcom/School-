import { User } from '../models/User';
import { connectDB } from '../config/database';
import argon2 from 'argon2';
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
  const hashed = await argon2.hash(password);
  await User.create({
    email,
    password: hashed,
    firstName: 'Super',
    lastName: 'Admin',
    role: 'SUPER_ADMIN',
    isActive: true,
  });

  logger.info(`Admin created: ${email}, password: ${password} (save this)`);
  process.exit(0);
})();
