import { User } from '../models/User';
import { SubscriptionPlan } from '../models/SubscriptionPlan';
import { Permission } from '../models/Permission';
import { connectDB } from '../config/database';
import argon2 from 'argon2';
import logger from '../config/logger';
import { env } from '../config/env';

(async () => {
  await connectDB();

  // Plans (prices in kobo, updated to match frontend)
  const plans = [
    {
      name: 'Starter',
      price: 2000000, // ₦20,000
      currency: 'NGN',
      billingCycle: 'TERMLY',
      entitlements: {
        maxStudents: 150,
        maxStaff: 30,
        storageGB: 2,
        smsMonthly: 200,
        customReportCards: false,
        analytics: false,
        parentPortal: true,
        apiAccess: false,
        multiCampus: false,
      },
      isActive: true,
    },
    {
      name: 'Growth',
      price: 3000000, // ₦30,000
      currency: 'NGN',
      billingCycle: 'TERMLY',
      entitlements: {
        maxStudents: 400,
        maxStaff: 100,
        storageGB: 10,
        smsMonthly: 500,
        customReportCards: true,
        analytics: true,
        parentPortal: true,
        apiAccess: true,
        multiCampus: false,
      },
      isActive: true,
    },
    {
      name: 'Professional',
      price: 3500000, // ₦35,000 (custom)
      currency: 'NGN',
      billingCycle: 'TERMLY',
      entitlements: {
        maxStudents: 9999,
        maxStaff: 500,
        storageGB: 50,
        smsMonthly: 2000,
        customReportCards: true,
        analytics: true,
        parentPortal: true,
        apiAccess: true,
        multiCampus: true,
      },
      isActive: true,
    },
  ];

  for (const planData of plans) {
    await SubscriptionPlan.findOneAndUpdate(
      { name: planData.name },
      planData,
      { upsert: true, setDefaultsOnInsert: true }
    );
  }
  logger.info('Subscription plans seeded');

  // Permissions
  const rolePermissions = [
    { role: 'SUPER_ADMIN', permissions: ['*:*'] },
    { role: 'SCHOOL_OWNER', permissions: ['*:*'] },
    { role: 'ACCOUNTANT', permissions: ['fees:read', 'fees:write', 'invoices:read', 'invoices:write', 'payments:read', 'payments:write', 'payments:approve', 'reports:finance'] },
    { role: 'TEACHER', permissions: ['students:read', 'results:write', 'attendance:write', 'classes:read'] },
    { role: 'STAFF', permissions: ['students:read', 'classes:read'] },
    { role: 'PARENT', permissions: ['students:read', 'payments:read', 'results:read', 'attendance:read'] },
  ];

  for (const rp of rolePermissions) {
    await Permission.findOneAndUpdate(
      { role: rp.role },
      { permissions: rp.permissions },
      { upsert: true }
    );
  }
  logger.info('Permissions seeded');

  // Super admin
  const adminEmail = env.ADMIN_EMAIL;
  const existingAdmin = await User.findOne({ email: adminEmail });
  if (!existingAdmin) {
    const password = Math.random().toString(36).slice(-12) + 'A1!';
    const hashed = await argon2.hash(password);
    await User.create({
      email: adminEmail,
      password: hashed,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
      isActive: true,
    });
    logger.info(`Super admin created: ${adminEmail}, password: ${password} (please change immediately)`);
  } else {
    logger.info('Super admin already exists');
  }

  process.exit();
})();
