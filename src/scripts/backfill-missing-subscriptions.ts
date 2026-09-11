// One-off backfill for schools created before onboarding created a
// Subscription automatically (see school.controller.ts#onboard step 4).
// Finds every School with no matching Subscription document and gives it
// a trial Subscription on the Starter plan so subscription-gated features
// (renewal, SMS top-up, the Subscription page) stop failing with
// "No subscription found. Please contact support."
//
// Run with: npx ts-node src/scripts/backfill-missing-subscriptions.ts

import { School } from '../models/School';
import { Subscription } from '../models/Subscription';
import { SubscriptionPlan } from '../models/SubscriptionPlan';
import { connectDB } from '../config/database';
import logger from '../config/logger';

(async () => {
  await connectDB();

  const defaultPlan =
    (await SubscriptionPlan.findOne({ name: 'Starter', isActive: true })) ||
    (await SubscriptionPlan.findOne({ isActive: true }));

  if (!defaultPlan) {
    logger.error('No active SubscriptionPlan found. Run `npm run seed` first, then retry this script.');
    process.exit(1);
  }

  const durationMap: Record<string, number> = { MONTHLY: 30, TERMLY: 90, ANNUAL: 365 };
  const trialDays = 7;

  const schools = await School.find({});
  let created = 0;
  let skipped = 0;

  for (const school of schools) {
    const existing = await Subscription.findOne({ schoolId: school._id });
    if (existing) {
      skipped++;
      continue;
    }

    const now = new Date();
    const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    const subscription = new Subscription({
      schoolId: school._id,
      planId: defaultPlan._id,
      status: 'ACTIVE',
      startDate: now,
      endDate: trialEnd,
      autoRenew: true,
      priceAtPurchase: defaultPlan.price,
      billingCycleAtPurchase: defaultPlan.billingCycle,
      durationDaysAtPurchase: durationMap[defaultPlan.billingCycle] || 90,
      isTrial: true,
      trialEndDate: trialEnd,
    });
    await subscription.save();

    school.subscriptionId = subscription._id.toString();
    await school.save();

    created++;
    logger.info(`Created trial subscription for school ${school._id} (${school.name})`);
  }

  logger.info(`Backfill complete. ${created} subscriptions created, ${skipped} schools already had one.`);
  process.exit(0);
})().catch((err) => {
  logger.error('Backfill failed:', err);
  process.exit(1);
});
