import { User } from '../models/User';
import { SubscriptionPlan } from '../models/SubscriptionPlan';
import { Permission } from '../models/Permission';
import { connectDB } from '../config/database';
import logger from '../config/logger';
import { env } from '../config/env';

(async () => {
  await connectDB();

  const plans = [
    {
      name: 'Starter',
      price: 2000000,
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
      price: 3000000,
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
      price: 3500000,
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

  const rolePermissions = [
    { role: 'SUPER_ADMIN', permissions: ['*:*'] },
    { role: 'SCHOOL_OWNER', permissions: ['*:*'] },
    {
      role: 'ACCOUNTANT',
      permissions: [
        'fees:read', 'fees:write',
        'invoices:read', 'invoices:write',
        'payments:read', 'payments:write', 'payments:approve',
        'reports:finance',
      ],
    },
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

  // Super admin — DO NOT pre-hash. The User model's pre-save hook hashes.
  const adminEmail = env.ADMIN_EMAIL;
  const existingAdmin = await User.findOne({ email: adminEmail });
  if (!existingAdmin) {
    const password = Math.random().toString(36).slice(-12) + 'A1!';
    await User.create({
      email: adminEmail,
      username: 'admin',
      password,             // plain — the hook hashes
      firstName: 'Super',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
      isActive: true,
    });
    logger.info(`Super admin created: ${adminEmail}, password: ${password} (save this!)`);
  } else {
    logger.info('Super admin already exists');
  }

  process.exit(0);
})().catch((err) => {
  logger.error('Seed failed:', err);
  process.exit(1);
});
