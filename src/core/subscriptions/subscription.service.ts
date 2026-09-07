import { Subscription } from '../../models/Subscription';
import { SubscriptionPlan } from '../../models/SubscriptionPlan';
import { NotFoundError } from '../../utils/errors';

export class SubscriptionService {
  static async create(data: any) {
    const plan = await SubscriptionPlan.findById(data.planId);
    if (!plan) throw new NotFoundError('Plan not found');

    const durationMap: Record<string, number> = { MONTHLY: 30, TERMLY: 90, ANNUAL: 365 };
    const subscription = new Subscription({
      ...data,
      priceAtPurchase: plan.price,
      billingCycleAtPurchase: plan.billingCycle,
      durationDaysAtPurchase: durationMap[plan.billingCycle] || 90,
    });
    await subscription.save();
    return subscription;
  }

  static async getById(id: string, schoolId: string) {
    const sub = await Subscription.findOne({ _id: id, schoolId }).populate('planId');
    if (!sub) throw new NotFoundError('Subscription not found');
    return sub;
  }

  static async getAll(schoolId: string, query: any) {
    return Subscription.find({ schoolId, ...query }).populate('planId');
  }

  static async update(id: string, schoolId: string, data: any) {
    const sub = await Subscription.findOneAndUpdate({ _id: id, schoolId }, data, { new: true });
    if (!sub) throw new NotFoundError('Subscription not found');
    return sub;
  }

  static async cancel(id: string, schoolId: string) {
    const sub = await Subscription.findOneAndUpdate(
      { _id: id, schoolId },
      { status: 'CANCELLED' },
      { new: true }
    );
    if (!sub) throw new NotFoundError('Subscription not found');
    return sub;
  }

  static async getPlans() {
    return SubscriptionPlan.find({ isActive: true });
  }
}
