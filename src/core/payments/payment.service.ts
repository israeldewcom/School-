import { Payment } from '../../models/Payment';
import { Invoice } from '../../models/Invoice';
import { LedgerEntry } from '../../models/LedgerEntry';
import { AuditLog } from '../../models/AuditLog';
import { Parent } from '../../models/Parent';
import { Student } from '../../models/Student';
import { Subscription } from '../../models/Subscription';
import { SubscriptionPlan } from '../../models/SubscriptionPlan';
import { School } from '../../models/School';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { acquireLock, releaseLock } from '../../config/redis';
import { smsQueue, emailQueue, pdfQueue, automationQueue } from '../../jobs/queues';
import logger from '../../config/logger';
import { env } from '../../config/env';
import mongoose from 'mongoose';
import axios from 'axios';
import { invalidateSubscriptionCache } from '../../middleware/subscription.middleware';

export class PaymentService {
  // ... existing methods (processPaystackWebhook, recordManualPayment, approveManualPayment, reconcilePendingPayments)

  // NEW: Handle subscription payment (converts trial to paid)
  static async handleSubscriptionPayment(schoolId: string, planId: string, reference: string) {
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) throw new NotFoundError('Plan not found');
    const subscription = await Subscription.findOne({ schoolId });
    if (!subscription) throw new NotFoundError('Subscription not found');

    subscription.isTrial = false;
    subscription.trialEndDate = null;
    subscription.status = 'ACTIVE';
    subscription.planId = plan._id;
    subscription.priceAtPurchase = plan.price;
    subscription.billingCycleAtPurchase = plan.billingCycle;
    const durationMap: Record<string, number> = { MONTHLY: 30, TERMLY: 90, ANNUAL: 365 };
    subscription.durationDaysAtPurchase = durationMap[plan.billingCycle] || 90;
    subscription.endDate = new Date(Date.now() + subscription.durationDaysAtPurchase * 24 * 60 * 60 * 1000);
    await subscription.save();

    await invalidateSubscriptionCache(schoolId);

    // Log payment
    const payment = new Payment({
      schoolId,
      studentId: null,
      invoiceId: null,
      amount: plan.price,
      method: 'ONLINE',
      reference,
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      metadata: { type: 'subscription', planId: plan._id },
    });
    await payment.save();

    return subscription;
  }

  // NEW: SMS top-up
  static async topUpSMS(schoolId: string, amount: number, reference: string) {
    const school = await School.findById(schoolId);
    if (!school) throw new NotFoundError('School not found');
    const credits = Math.floor(amount / (school.smsRate || 2000));
    if (credits <= 0) throw new BadRequestError('Amount too low to purchase credits');
    school.smsBalance += credits;
    await school.save();

    // Log payment
    const payment = new Payment({
      schoolId,
      studentId: null,
      invoiceId: null,
      amount,
      method: 'ONLINE',
      reference,
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      metadata: { type: 'sms_topup', credits },
    });
    await payment.save();

    return { credits, newBalance: school.smsBalance };
  }

  // Extend webhook handler to support subscription and SMS top-up
  static async processPaystackWebhook(payload: any) {
    const event = payload.event;
    const data = payload.data;
    if (event !== 'charge.success') {
      logger.info(`Ignored webhook event: ${event}`);
      return null;
    }

    const reference = data.reference;
    const lockKey = `payment:lock:${reference}`;
    const lockToken = await acquireLock(lockKey, 30);
    if (!lockToken) {
      logger.warn(`Payment lock not acquired for reference ${reference}`);
      return { status: 'processing' };
    }

    try {
      const existingPayment = await Payment.findOne({ reference });
      if (existingPayment) {
        logger.info(`Payment already processed for reference ${reference}`);
        return existingPayment;
      }

      const metadata = data.metadata || {};

      // Handle subscription payment
      if (metadata.type === 'subscription') {
        const { schoolId, planId } = metadata;
        if (!schoolId || !planId) throw new BadRequestError('Missing schoolId or planId in metadata');
        const subscription = await this.handleSubscriptionPayment(schoolId, planId, reference);
        return subscription;
      }

      // Handle SMS top-up
      if (metadata.type === 'sms_topup') {
        const { schoolId } = metadata;
        if (!schoolId) throw new BadRequestError('Missing schoolId in metadata');
        const result = await this.topUpSMS(schoolId, data.amount, reference);
        return result;
      }

      // Existing invoice payment logic (from previous code)
      const invoiceNumber = metadata.invoiceNumber;
      if (!invoiceNumber) throw new BadRequestError('Invoice number missing in metadata');
      const invoice = await Invoice.findOne({ invoiceNumber });
      if (!invoice) throw new NotFoundError('Invoice not found');
      // ... rest of existing payment processing code (keeping original logic)
      // (we won't duplicate the whole method here – assume it's preserved)

    } finally {
      await releaseLock(lockKey, lockToken);
    }
  }
}
