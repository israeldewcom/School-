import { Subscription } from '../models/Subscription';
import { SubscriptionPlan } from '../models/SubscriptionPlan';
import { connectDB } from '../config/database';
import logger from '../config/logger';

(async () => {
  await connectDB();

  const durationMap: Record<string, number> = { MONTHLY: 30, TERMLY: 90, ANNUAL: 365 };

  const subscriptions = await Subscription.find({
    $or: [
      { billingCycleAtPurchase: { $exists: false } },
      { durationDaysAtPurchase: { $exists: false } }
    ]
  });

  if (subscriptions.length === 0) {
    logger.info('No subscriptions to migrate.');
    process.exit(0);
  }

  for (const sub of subscriptions) {
    const plan = await SubscriptionPlan.findById(sub.planId);
    if (plan) {
      sub.billingCycleAtPurchase = plan.billingCycle;
      sub.durationDaysAtPurchase = durationMap[plan.billingCycle] || 90;
      await sub.save();
      logger.info(`Migrated subscription ${sub._id} with billingCycle ${plan.billingCycle} and duration ${sub.durationDaysAtPurchase} days`);
    } else {
      logger.warn(`Plan not found for subscription ${sub._id}, skipping.`);
    }
  }

  logger.info(`Migration complete. ${subscriptions.length} subscriptions updated.`);
  process.exit();
})();
