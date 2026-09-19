// src/core/subscriptions/subscription.service.ts
import mongoose from 'mongoose';
import { Subscription } from '../../models/Subscription';
import { SubscriptionPlan } from '../../models/SubscriptionPlan';
import { School } from '../../models/School';
import { SmsPurchase } from '../../models/SmsPurchase';
import { Payment } from '../../models/Payment';
import { AuditLog } from '../../models/AuditLog';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';
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

    const school = await School.findById(schoolId);
    if (!school) throw new NotFoundError('School not found');

    (school as any).smsBalance = ((school as any).smsBalance || 0) + credits;
    await school.save();

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
