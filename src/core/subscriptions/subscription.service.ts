import { Subscription } from '../../models/Subscription';
import { SubscriptionPlan } from '../../models/SubscriptionPlan';
import { SubscriptionRenewal } from '../../models/SubscriptionRenewal';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import mongoose from 'mongoose';
import { invalidateSubscriptionCache } from '../../middleware/subscription.middleware';
import { emailQueue } from '../../jobs/queues';

export class SubscriptionService {
  static async create(data: any) {
    const plan = await SubscriptionPlan.findById(data.planId);
    if (!plan) throw new NotFoundError('Plan not found');

    const durationMap: Record<string, number> = { MONTHLY: 30, TERMLY: 90, ANNUAL: 365 };
    const now = new Date();
    const trialDays = 7;

    const subscription = new Subscription({
      ...data,
      priceAtPurchase: plan.price,
      billingCycleAtPurchase: plan.billingCycle,
      durationDaysAtPurchase: durationMap[plan.billingCycle] || 90,
      // Trial settings
      isTrial: true,
      trialEndDate: new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000),
      endDate: new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000),
      status: 'ACTIVE',
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

  // NEW renewal methods
  static async requestRenewal(schoolId: string, data: { plan: string; amount: number; proofUrl?: string; reference: string }) {
    const subscription = await Subscription.findOne({ schoolId, status: { $in: ['ACTIVE', 'EXPIRED'] } });
    if (!subscription) throw new NotFoundError('No active subscription found');

    const renewal = new SubscriptionRenewal({
      schoolId,
      subscriptionId: subscription._id,
      ...data,
      status: 'pending',
    });
    await renewal.save();

    // Notify platform admin (email or in-app notification)
    await emailQueue.add('send-renewal-notification', { renewalId: renewal._id });

    return renewal;
  }

  static async approveRenewal(renewalId: string, reviewerId: string) {
    const renewal = await SubscriptionRenewal.findById(renewalId);
    if (!renewal) throw new NotFoundError('Renewal request not found');
    if (renewal.status !== 'pending') throw new BadRequestError('Already reviewed');

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      renewal.status = 'approved';
      renewal.reviewedAt = new Date();
      renewal.reviewedBy = reviewerId;
      await renewal.save({ session });

      // Extend subscription
      const subscription = await Subscription.findById(renewal.subscriptionId);
      if (subscription) {
        const daysToAdd = subscription.durationDaysAtPurchase || 90;
        subscription.endDate = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);
        subscription.status = 'ACTIVE';
        subscription.isTrial = false;
        subscription.trialEndDate = null;
        await subscription.save({ session });
        await invalidateSubscriptionCache(subscription.schoolId.toString());
      }

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
    return renewal;
  }

  static async rejectRenewal(renewalId: string, reviewerId: string, reason: string) {
    const renewal = await SubscriptionRenewal.findById(renewalId);
    if (!renewal) throw new NotFoundError('Renewal request not found');
    if (renewal.status !== 'pending') throw new BadRequestError('Already reviewed');
    renewal.status = 'rejected';
    renewal.reviewedAt = new Date();
    renewal.reviewedBy = reviewerId;
    renewal.rejectionReason = reason;
    await renewal.save();
    return renewal;
  }
}
