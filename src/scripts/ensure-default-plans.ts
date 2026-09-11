// src/scripts/ensure-default-plans.ts
//
// Auto-heals the "no SubscriptionPlan exists" problem on every server boot.
// Runs once, on startup, after MongoDB connects — if there are no active
// SubscriptionPlan documents yet, it creates the default set (Starter,
// Growth, Professional) using the same data as scripts/seed.ts.
//
// This is intentionally SAFE to run every time the server starts:
//  - It only inserts a plan if one with that name doesn't already exist
//    (upsert, matched by name) — it never overwrites prices you've since
//    edited in the database.
//  - It never touches users, permissions, or admin accounts — only plans.
//
// Why this exists: on free hosting tiers (e.g. Render's free plan) there
// is no Shell access to run `npm run seed` by hand, and a school could be
// onboarded before anyone remembers to seed plans — leaving every
// subscription-gated feature broken with "No subscription found." This
// makes that impossible: the moment the plans collection is empty, the
// next server boot repopulates it automatically.

import { SubscriptionPlan } from '../models/SubscriptionPlan';
import logger from '../config/logger';

const DEFAULT_PLANS = [
  {
    name: 'Starter',
    price: 2000000, // ₦20,000 (stored in kobo)
    currency: 'NGN',
    billingCycle: 'TERMLY' as const,
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
    billingCycle: 'TERMLY' as const,
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
    price: 3500000, // ₦35,000
    currency: 'NGN',
    billingCycle: 'TERMLY' as const,
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

export const ensureDefaultPlans = async (): Promise<void> => {
  try {
    const existingCount = await SubscriptionPlan.countDocuments({ isActive: true });
    if (existingCount > 0) {
      // Plans already exist — do nothing. This keeps any manual price/plan
      // edits made directly in the database intact across restarts.
      return;
    }

    for (const planData of DEFAULT_PLANS) {
      await SubscriptionPlan.findOneAndUpdate(
        { name: planData.name },
        planData,
        { upsert: true, setDefaultsOnInsert: true }
      );
    }
    logger.info('No active subscription plans found — default plans (Starter, Growth, Professional) created automatically.');
  } catch (err) {
    // Never let this take the server down — worst case, plans stay missing
    // and existing error handling (NotFoundError etc.) still applies.
    logger.error('ensureDefaultPlans failed:', err);
  }
};
