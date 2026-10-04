// src/core/subscriptions/subscription.service.ts
import mongoose from 'mongoose';
import { Subscription } from '../../models/Subscription';
import { SubscriptionPlan } from '../../models/SubscriptionPlan';
import { School } from '../../models/School';
import { SmsPurchase } from '../../models/SmsPurchase';
import { Payment } from '../../models/Payment';
import { AuditLog } from '../../models/AuditLog';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';
import { invalidateSubscriptionCache } from '../../middleware/subscription.middleware';
import logger from '../../config/logger';

const SMS_NAIRA_PER_CREDIT = 20;

export class SubscriptionService {
  // ------------------------------------------------------------------
  // Read
  // ------------------------------------------------------------------
  static async getCurrent(schoolId: string) {
    const sub = await Subscription.findOne({ schoolId })
      .sort({ createdAt: -1 })
      .populate('planId')
      .lean();

    if (!sub) {
      return {
        status: 'none',
        plan: null,
        expires: null,
        payments: [],
      };
    }

    const plan: any = (sub as any).planId || {};
    return {
      status: (sub as any).isTrial ? 'trial' : ((sub as any).status || 'active').toLowerCase(),
      plan: plan.name ? plan.name.toLowerCase() : null,
      planName: plan.name || null,
      price: (sub as any).priceAtPurchase || plan.price || 0,
      expires: (sub as any).endDate || null,
      isTrial: !!(sub as any).isTrial,
      payments: [],
    };
  }

  static async listPlans() {
    const plans = await SubscriptionPlan.find({ isActive: true }).lean();
    if (plans.length > 0) return plans;

    // Seed with defaults if nothing exists yet.
    const defaults = [
      { name: 'Starter', price: 2000000, billingCycle: 'TERMLY', maxStudents: 150, isActive: true },
      { name: 'Growth', price: 3000000, billingCycle: 'TERMLY', maxStudents: 400, isActive: true },
      { name: 'Professional', price: 3500000, billingCycle: 'TERMLY', maxStudents: 1000, isActive: true },
    ];
    try {
      await SubscriptionPlan.insertMany(defaults, { ordered: false });
    } catch (_) {}
    return SubscriptionPlan.find({ isActive: true }).lean();
  }

  // ------------------------------------------------------------------
  // Renew / subscribe
  // ------------------------------------------------------------------
  static async submitRenewal(schoolId: string, actorId: string, data: any) {
    const { reference, date, planName, proof } = data || {};
    if (!reference || !String(reference).trim()) {
      throw new BadRequestError('Transaction reference is required');
    }

    const sub = await Subscription.findOne({ schoolId }).sort({ createdAt: -1 });
    if (sub) {
      (sub as any).pendingRenewal = {
        reference: String(reference).trim(),
        planName: planName || null,
        date: date ? new Date(date) : new Date(),
        proof: proof || null,
        submittedAt: new Date(),
        submittedBy: actorId,
      };
      await sub.save();
      logger.info(`Renewal submitted for school ${schoolId} — ref ${reference}`);
      return { submitted: true };
    }

    const newSub = new Subscription({
      schoolId,
      startDate: new Date(),
      endDate: new Date(Date.now() + 90 * 86400000),
      status: 'ACTIVE',
      isTrial: false,
      priceAtPurchase: 0,
      billingCycleAtPurchase: 'TERMLY',
    });
    await newSub.save();
    logger.info(`Subscription created for school ${schoolId}`);
    return { submitted: true, created: true };
  }

  // ------------------------------------------------------------------
  // Super-admin renewal review
  // ------------------------------------------------------------------
  static async listPendingRenewals() {
    const subs: any[] = await Subscription.find({ 'pendingRenewal.reference': { $exists: true } })
      .populate('schoolId', 'name')
      .sort({ 'pendingRenewal.submittedAt': 1 })
      .lean();
    const plans: any[] = await SubscriptionPlan.find({}).lean();

    return subs.map((s) => {
      const pr = s.pendingRenewal;
      const plan = plans.find(
        (p) => String(p.name).toLowerCase() === String(pr.planName || '').toLowerCase()
      );
      return {
        id: String(s._id),
        _id: String(s._id),
        schoolId: s.schoolId ? { id: String(s.schoolId._id), name: s.schoolId.name } : null,
        plan: pr.planName || null,
        amount: plan ? plan.price : s.priceAtPurchase || 0,
        reference: pr.reference,
        proofUrl: pr.proof || null,
        submittedAt: pr.submittedAt,
      };
    });
  }

  static async approveRenewal(subscriptionId: string, actorId: string) {
    if (!mongoose.isValidObjectId(subscriptionId)) throw new BadRequestError('Invalid renewal id');
    const sub: any = await Subscription.findById(subscriptionId);
    if (!sub || !sub.pendingRenewal) throw new NotFoundError('No pending renewal found');

    const pr = sub.pendingRenewal;
    const plans: any[] = await SubscriptionPlan.find({}).lean();
    const plan = plans.find(
      (p) => String(p.name).toLowerCase() === String(pr.planName || '').toLowerCase()
    );

    const CYCLE_DAYS: Record<string, number> = { MONTHLY: 30, TERMLY: 90, ANNUAL: 365 };
    const cycle = plan?.billingCycle || sub.billingCycleAtPurchase || 'TERMLY';
    const days = CYCLE_DAYS[cycle] || 90;

    const now = new Date();
    const base = sub.endDate && sub.endDate > now ? sub.endDate : now;
    sub.endDate = new Date(base.getTime() + days * 86400000);
    if (plan) {
      sub.planId = plan._id;
      sub.priceAtPurchase = plan.price;
    }
    sub.billingCycleAtPurchase = cycle;
    sub.durationDaysAtPurchase = days;
    sub.status = 'ACTIVE';
    sub.isTrial = false;
    sub.trialEndDate = undefined;
    sub.renewalHistory.push({
      reference: pr.reference,
      planName: pr.planName || null,
      submittedAt: pr.submittedAt,
      decision: 'APPROVED',
      decidedAt: now,
      decidedBy: actorId,
      daysAdded: days,
    });
    sub.pendingRenewal = undefined;
    await sub.save();
    await invalidateSubscriptionCache(String(sub.schoolId));

    await AuditLog.create({
      actor: actorId,
      action: 'subscription.renewal.approved',
      resource: 'Subscription',
      resourceId: sub._id,
      after: { reference: pr.reference, daysAdded: days, newEndDate: sub.endDate },
    });
    return { approved: true, endDate: sub.endDate, daysAdded: days };
  }

  static async rejectRenewal(subscriptionId: string, actorId: string, reason?: string) {
    if (!mongoose.isValidObjectId(subscriptionId)) throw new BadRequestError('Invalid renewal id');
    const sub: any = await Subscription.findById(subscriptionId);
    if (!sub || !sub.pendingRenewal) throw new NotFoundError('No pending renewal found');

    const pr = sub.pendingRenewal;
    sub.renewalHistory.push({
      reference: pr.reference,
      planName: pr.planName || null,
      submittedAt: pr.submittedAt,
      decision: 'REJECTED',
      decidedAt: new Date(),
      decidedBy: actorId,
      reason: reason || 'No reason provided',
    });
    sub.pendingRenewal = undefined;
    await sub.save();

    await AuditLog.create({
      actor: actorId,
      action: 'subscription.renewal.rejected',
      resource: 'Subscription',
      resourceId: sub._id,
      after: { reference: pr.reference, reason },
    });
    return { rejected: true };
  }

  // ------------------------------------------------------------------
  // SMS top-up
  //
  // Records the purchase in SmsPurchase and adds credits to the school
  // document. No `studentId` required — SMS purchases aren't tied to
  // any student.
  // ------------------------------------------------------------------
  static async topupSms(schoolId: string, amountNaira: number) {
    if (!amountNaira || amountNaira < 1000) {
      throw new BadRequestError('Minimum top-up is ₦1,000');
    }
    if (amountNaira > 5_000_000) {
      throw new BadRequestError('Maximum single top-up is ₦5,000,000');
    }

    const credits = Math.floor(amountNaira / SMS_NAIRA_PER_CREDIT);
    const reference = `SMS-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;

    await SmsPurchase.create({
      schoolId,
      amount: amountNaira,
      credits,
      reference,
      status: 'PAID',
      provider: 'manual',
    });

    // Atomic increment — no read-modify-write race with SMS sending.
    const school: any = await School.findByIdAndUpdate(
      schoolId,
      { $inc: { smsBalance: credits } },
      { new: true }
    );
    if (!school) throw new NotFoundError('School not found');

    try {
      await AuditLog.create({
        actor: 'system',
        action: 'sms.topup',
        resource: 'School',
        resourceId: school._id,
        after: { amountNaira, credits, reference },
      });
    } catch (_) {}

    logger.info(`SMS topup: ${credits} credits for school ${schoolId} (₦${amountNaira})`);
    return {
      credits,
      newBalance: (school as any).smsBalance,
      reference,
    };
  }

  // ------------------------------------------------------------------
  // SMS balance + low-balance flag (shown as a banner in the app)
  // ------------------------------------------------------------------
  static async smsBalance(schoolId: string) {
    const school: any = await School.findById(schoolId).select('smsBalance smsMonthlyUsage').lean();
    if (!school) throw new NotFoundError('School not found');
    const balance = school.smsBalance || 0;
    const LOW_THRESHOLD = 50;
    return {
      balance,
      monthlyUsage: school.smsMonthlyUsage || 0,
      nairaPerCredit: SMS_NAIRA_PER_CREDIT,
      lowThreshold: LOW_THRESHOLD,
      level: balance < 1 ? 'EMPTY' : balance < LOW_THRESHOLD ? 'LOW' : 'OK',
      message:
        balance < 1
          ? 'SMS credit is finished. Parents are only getting in-app notices until you top up.'
          : balance < LOW_THRESHOLD
            ? `SMS credit is low (${balance} left). Top up so parents keep receiving SMS alerts.`
            : null,
    };
  }

  // ------------------------------------------------------------------
  // Trial status
  // ------------------------------------------------------------------
  static async trialStatus(schoolId: string) {
    const sub = await Subscription.findOne({ schoolId })
      .sort({ createdAt: -1 })
      .lean();
    if (!sub || !(sub as any).isTrial) {
      return { isTrial: false, daysLeft: 0 };
    }
    const end = (sub as any).trialEndDate || (sub as any).endDate;
    if (!end) return { isTrial: true, daysLeft: 0 };
    const daysLeft = Math.max(
      0,
      Math.ceil((new Date(end).getTime() - Date.now()) / 86400000)
    );
    return { isTrial: true, daysLeft };
  }
}
