// src/core/subscriptions/subscription.service.ts

import { Subscription } from '../../models/Subscription';
import { SubscriptionPlan } from '../../models/SubscriptionPlan';
import { SubscriptionRenewal } from '../../models/SubscriptionRenewal';
import { School } from '../../models/School';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import mongoose from 'mongoose';
import { invalidateSubscriptionCache } from '../../middleware/subscription.middleware';
import { emailQueue } from '../../jobs/queues';
import { cloudinary } from '../../integrations/storage/cloudinary';

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

  // Subscription summary for the school-facing Subscription page.
  // Shape matches what the frontend's POST_RENDER_HOOKS.subscription expects:
  // { plan, status, expires, payments: [{date, method, amount}] }
  //
  // Schools with no Subscription document yet (never onboarded through the
  // step that creates one, or created before that step existed) get a
  // "none" status instead of a 404 — the frontend uses this to show the
  // plan-picker / first-time subscribe flow instead of "Renew".
  static async getCurrent(schoolId: string) {
    const subscription = await Subscription.findOne({ schoolId }).populate('planId');
    if (!subscription) {
      return {
        plan: null,
        status: 'none',
        expires: null,
        isTrial: false,
        payments: [],
      };
    }

    const statusMap: Record<string, string> = {
      ACTIVE: subscription.isTrial ? 'pending' : 'active',
      PAST_DUE: 'past_due',
      EXPIRED: 'expired',
      CANCELLED: 'cancelled',
    };

    const planName = (subscription.planId as any)?.name?.toLowerCase() || 'starter';

    const { Payment } = require('../../models/Payment');
    const payments = await Payment.find({
      schoolId,
      'metadata.type': 'subscription',
      status: 'CONFIRMED',
    })
      .sort({ confirmedAt: -1 })
      .limit(5)
      .select('amount method confirmedAt');

    return {
      plan: planName,
      status: statusMap[subscription.status] || subscription.status.toLowerCase(),
      expires: subscription.endDate,
      isTrial: subscription.isTrial,
      payments: payments.map((p: any) => ({
        date: p.confirmedAt,
        method: p.method === 'ONLINE' ? 'Online' : 'Bank Transfer',
        amount: p.amount,
      })),
    };
  }

  // Accepts the manual bank-transfer renewal payload as sent by the
  // frontend's submitRenewal(): { reference, date, proof, planName }.
  // `proof` is a base64 data URL (or empty string) from
  // FileReader.readAsDataURL. `planName` is optional — if omitted, the
  // renewal keeps the school's current plan (pure renewal). If provided,
  // it must match a real, active SubscriptionPlan; the plan's own price is
  // always used for `amount` — a client can request a plan by name, but
  // can never dictate what it costs.
  static async requestRenewal(
    schoolId: string,
    data: { reference: string; date?: string; proof?: string; planName?: string }
  ) {
    const subscription = await Subscription.findOne({
      schoolId,
      status: { $in: ['ACTIVE', 'EXPIRED', 'PAST_DUE'] },
    }).populate('planId');
    if (!subscription) throw new NotFoundError('No active subscription found');

    if (!data.reference || !data.reference.trim()) {
      throw new BadRequestError('Transaction reference is required');
    }

    const existing = await SubscriptionRenewal.findOne({ reference: data.reference.trim() });
    if (existing) {
      throw new BadRequestError('A renewal with this reference has already been submitted');
    }

    let proofUrl: string | undefined;
    if (data.proof) {
      try {
        const uploadResult = await cloudinary.uploader.upload(data.proof, {
          folder: `schools/${schoolId}/renewal-proofs`,
          resource_type: 'auto',
        });
        proofUrl = uploadResult.secure_url;
      } catch (err) {
        throw new BadRequestError('Failed to upload payment proof. Please try again.');
      }
    }

    const currentPlan = subscription.planId as any;

    // Resolve the plan being paid for. Defaults to the current plan (a
    // plain renewal). If the client requested a different plan by name
    // (e.g. upgrading Starter -> Pro), look it up server-side — never
    // trust a client-supplied price or plan id directly.
    let targetPlan = currentPlan;
    if (data.planName && data.planName.trim().toLowerCase() !== currentPlan?.name?.toLowerCase()) {
      const requested = await SubscriptionPlan.findOne({
        name: new RegExp(`^${data.planName.trim()}$`, 'i'),
        isActive: true,
      });
      if (!requested) {
        throw new BadRequestError(`"${data.planName}" is not a valid plan`);
      }
      targetPlan = requested;
    }

    const renewal = new SubscriptionRenewal({
      schoolId: new mongoose.Types.ObjectId(schoolId),
      subscriptionId: subscription._id,
      plan: targetPlan?.name || 'Unknown plan',
      amount: targetPlan?.price || 0,
      proofUrl,
      reference: data.reference.trim(),
      status: 'pending',
    });
    await renewal.save();

    await emailQueue.add('send-renewal-notification', { renewalId: renewal._id });
    return renewal;
  }

  // First-time subscribe for a school with NO Subscription document yet.
  // Creates a placeholder Subscription (status PENDING, no dates set) so
  // there's something for the approval flow to activate, then records the
  // payment proof as a SubscriptionRenewal exactly like requestRenewal
  // does — approveRenewal() already knows how to take a renewal's chosen
  // plan and (re)activate the linked subscription, so no changes were
  // needed there.
  static async requestNewSubscription(
    schoolId: string,
    data: { reference: string; date?: string; proof?: string; planName: string }
  ) {
    const existing = await Subscription.findOne({ schoolId });
    if (existing) {
      throw new BadRequestError('This school already has a subscription. Use renew instead.');
    }

    if (!data.planName || !data.planName.trim()) {
      throw new BadRequestError('Please choose a plan');
    }

    const plan = await SubscriptionPlan.findOne({
      name: new RegExp(`^${data.planName.trim()}$`, 'i'),
      isActive: true,
    });
    if (!plan) throw new BadRequestError(`"${data.planName}" is not a valid plan`);

    if (!data.reference || !data.reference.trim()) {
      throw new BadRequestError('Transaction reference is required');
    }

    const existingRef = await SubscriptionRenewal.findOne({ reference: data.reference.trim() });
    if (existingRef) {
      throw new BadRequestError('A renewal with this reference has already been submitted');
    }

    let proofUrl: string | undefined;
    if (data.proof) {
      try {
        const uploadResult = await cloudinary.uploader.upload(data.proof, {
          folder: `schools/${schoolId}/renewal-proofs`,
          resource_type: 'auto',
        });
        proofUrl = uploadResult.secure_url;
      } catch (err) {
        throw new BadRequestError('Failed to upload payment proof. Please try again.');
      }
    }

    const durationMap: Record<string, number> = { MONTHLY: 30, TERMLY: 90, ANNUAL: 365 };
    const now = new Date();

    // Placeholder subscription, not yet active — approveRenewal() sets
    // status/dates for real once a super admin approves the payment.
    const subscription = new Subscription({
      schoolId: new mongoose.Types.ObjectId(schoolId),
      planId: plan._id,
      status: 'PENDING',
      startDate: now,
      endDate: now,
      autoRenew: true,
      priceAtPurchase: plan.price,
      billingCycleAtPurchase: plan.billingCycle,
      durationDaysAtPurchase: durationMap[plan.billingCycle] || 90,
      isTrial: false,
    });
    await subscription.save();

    const school = await School.findById(schoolId);
    if (school) {
      school.subscriptionId = subscription._id.toString();
      await school.save();
    }

    const renewal = new SubscriptionRenewal({
      schoolId: new mongoose.Types.ObjectId(schoolId),
      subscriptionId: subscription._id,
      plan: plan.name,
      amount: plan.price,
      proofUrl,
      reference: data.reference.trim(),
      status: 'pending',
    });
    await renewal.save();

    await emailQueue.add('send-renewal-notification', { renewalId: renewal._id });
    return renewal;
  }

  // SMS credit top-up requested directly from the Subscription page (manual
  // payment, same pattern as renewal — credited immediately here since there
  // is no gateway in the loop; the amount/credits still get recorded on the
  // school + a Payment row for the billing history view).
  static async topUpSMS(schoolId: string, amount: number) {
    if (!amount || amount < 1000) {
      throw new BadRequestError('Minimum top-up is ₦1,000');
    }
    const school = await School.findById(schoolId);
    if (!school) throw new NotFoundError('School not found');

    const credits = Math.floor(amount / (school.smsRate || 2000));
    if (credits <= 0) throw new BadRequestError('Amount too low to purchase credits');

    school.smsBalance += credits;
    await school.save();

    const { Payment } = require('../../models/Payment');
    const payment = new Payment({
      schoolId,
      studentId: null,
      invoiceId: null,
      amount,
      method: 'MANUAL',
      reference: `SMS-${Date.now()}`,
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      metadata: { type: 'sms_topup', credits },
    });
    await payment.save();

    return { credits, newBalance: school.smsBalance };
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
      renewal.reviewedBy = new mongoose.Types.ObjectId(reviewerId);
      await renewal.save({ session });

      const subscription = await Subscription.findById(renewal.subscriptionId);
      if (subscription) {
        // If the renewal named a plan different from the subscription's
        // current one (e.g. Starter -> Pro), switch the subscription onto
        // it. Falls back to the current plan by id if the name can't be
        // resolved, so a plain renewal never gets blocked by this step.
        let plan = await SubscriptionPlan.findById(subscription.planId);
        if (renewal.plan && plan?.name?.toLowerCase() !== renewal.plan.toLowerCase()) {
          const newPlan = await SubscriptionPlan.findOne({
            name: new RegExp(`^${renewal.plan}$`, 'i'),
            isActive: true,
          });
          if (newPlan) plan = newPlan;
        }

        const durationMap: Record<string, number> = { MONTHLY: 30, TERMLY: 90, ANNUAL: 365 };
        const daysToAdd = plan ? durationMap[plan.billingCycle] || 90 : subscription.durationDaysAtPurchase || 90;

        if (plan) {
          subscription.planId = plan._id;
          subscription.priceAtPurchase = plan.price;
          subscription.billingCycleAtPurchase = plan.billingCycle;
          subscription.durationDaysAtPurchase = daysToAdd;
        }
        subscription.endDate = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);
        subscription.status = 'ACTIVE';
        subscription.isTrial = false;
        subscription.trialEndDate = undefined;   // instead of null
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
    renewal.reviewedBy = new mongoose.Types.ObjectId(reviewerId);
    renewal.rejectionReason = reason;
    await renewal.save();
    return renewal;
  }
}
