import { Payment } from '../../models/Payment';
import { Invoice } from '../../models/Invoice';
import { Subscription } from '../../models/Subscription';
import { SubscriptionPlan } from '../../models/SubscriptionPlan';
import { School } from '../../models/School';
import { BatchJob } from '../../models/BatchJob';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { acquireLock, releaseLock } from '../../config/mongoStore';
import { emailQueue, pdfQueue, reportQueue, safeQueueAdd } from '../../jobs/queues';
import logger from '../../config/logger';
import { invalidateSubscriptionCache } from '../../middleware/subscription.middleware';
import { cloudinary } from '../../integrations/storage/cloudinary';
import { mergePDFsFromUrls } from '../../utils/pdfMerge';
import mongoose from 'mongoose';
import axios from 'axios';
import { env } from '../../config/env';

export class PaymentService {
  // ------------------------------------------------------------------
  // Webhook processing
  // ------------------------------------------------------------------

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

      // Normal invoice payment
      const invoiceNumber = metadata.invoiceNumber;
      if (!invoiceNumber) throw new BadRequestError('Invoice number missing in metadata');

      const invoice = await Invoice.findOne({ invoiceNumber });
      if (!invoice) throw new NotFoundError('Invoice not found');

      const paystackAmount = data.amount;
      if (paystackAmount > invoice.balance) {
        throw new BadRequestError('Payment amount exceeds invoice balance');
      }

      const session = await mongoose.startSession();
      session.startTransaction();

      let payment;
      try {
        payment = new Payment({
          schoolId: invoice.schoolId,
          studentId: invoice.studentId,
          invoiceId: invoice._id,
          amount: paystackAmount,
          method: 'ONLINE',
          reference,
          providerTransactionId: data.id,
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          metadata: data,
        });
        await payment.save({ session });

        invoice.amountPaid += paystackAmount;
        invoice.balance = invoice.total - invoice.amountPaid;
        invoice.status = invoice.balance <= 0 ? 'PAID' : 'PARTIALLY_PAID';
        await invoice.save({ session });

        // Renew subscription if fully paid — NOTE: this is a student-fee
        // invoice. Renewing the school's SaaS subscription here is a
        // business-logic concern; kept as-is to avoid changing behavior
        // until you decide the correct rule.
        if (invoice.balance <= 0) {
          const subscription = await Subscription.findOne({
            schoolId: invoice.schoolId,
            status: { $in: ['ACTIVE', 'EXPIRED', 'PAST_DUE'] },
          });
          if (subscription) {
            const daysToAdd = subscription.durationDaysAtPurchase || 90;
            subscription.endDate = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);
            subscription.status = 'ACTIVE';
            subscription.isTrial = false;
            subscription.trialEndDate = undefined;
            await subscription.save({ session });
            await invalidateSubscriptionCache(invoice.schoolId.toString());
          }
        }

        await session.commitTransaction();
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }

      // 🔴 safeQueueAdd prevents a dead Redis from hanging this webhook.
      await safeQueueAdd(pdfQueue, 'generate-receipt', { paymentId: payment._id });
      await safeQueueAdd(emailQueue, 'send-payment-confirmation', { paymentId: payment._id });

      logger.info(`Payment processed successfully for invoice ${invoiceNumber}`);
      return payment;
    } finally {
      await releaseLock(lockKey, lockToken);
    }
  }

  // ------------------------------------------------------------------
  // Manual payments
  // ------------------------------------------------------------------

  static async recordManualPayment(paymentData: any) {
    const { schoolId, invoiceId, amount, method, receivedBy, reference, proofFile } = paymentData;
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) throw new NotFoundError('Invoice not found');

    let proofUrl: string | undefined;
    if (proofFile) {
      const uploadResult = await cloudinary.uploader.upload(proofFile.path, {
        folder: `schools/${schoolId}/payment-proofs`,
        resource_type: 'auto',
      });
      proofUrl = uploadResult.secure_url;
    }

    const payment = new Payment({
      schoolId,
      invoiceId,
      studentId: invoice.studentId,
      amount: amount * 100,
      method,
      reference: reference || `MANUAL-${Date.now()}`,
      status: 'PENDING',
      receivedBy,
      proofUrl,
    });
    await payment.save();

    // 🔴 safeQueueAdd
    await safeQueueAdd(emailQueue, 'send-payment-approval-request', { paymentId: payment._id });

    return payment;
  }

  static async approveManualPayment(paymentId: string, approverId: string) {
    const payment = await Payment.findById(paymentId);
    if (!payment) throw new NotFoundError('Payment not found');
    if (payment.status !== 'PENDING') throw new BadRequestError('Payment already processed');

    const invoice = await Invoice.findById(payment.invoiceId);
    if (!invoice) throw new NotFoundError('Invoice not found');

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      payment.status = 'CONFIRMED';
      payment.confirmedAt = new Date();
      payment.receivedBy = new mongoose.Types.ObjectId(approverId);
      await payment.save({ session });

      invoice.amountPaid += payment.amount;
      invoice.balance = invoice.total - invoice.amountPaid;
      invoice.status = invoice.balance <= 0 ? 'PAID' : 'PARTIALLY_PAID';
      await invoice.save({ session });

      if (invoice.balance <= 0) {
        const subscription = await Subscription.findOne({
          schoolId: invoice.schoolId,
          status: { $in: ['ACTIVE', 'EXPIRED', 'PAST_DUE'] },
        });
        if (subscription) {
          const daysToAdd = subscription.durationDaysAtPurchase || 90;
          subscription.endDate = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);
          subscription.status = 'ACTIVE';
          subscription.isTrial = false;
          subscription.trialEndDate = undefined;
          await subscription.save({ session });
          await invalidateSubscriptionCache(invoice.schoolId.toString());
        }
      }

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

    // 🔴 safeQueueAdd
    await safeQueueAdd(pdfQueue, 'generate-receipt', { paymentId: payment._id });
    await safeQueueAdd(emailQueue, 'send-payment-confirmation', { paymentId: payment._id });

    return payment;
  }

  // ------------------------------------------------------------------
  // Reconciliation
  // ------------------------------------------------------------------

  static async reconcilePendingPayments() {
    const pendingPayments = await Payment.find({
      status: 'PENDING',
      method: 'ONLINE',
      createdAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) },
    });
    let count = 0;
    for (const payment of pendingPayments) {
      try {
        const response = await axios.get(
          `https://api.paystack.co/transaction/verify/${payment.reference}`,
          { headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` } }
        );
        if (response.data.data.status === 'success') {
          await this.processPaystackWebhook({ event: 'charge.success', data: response.data.data });
          count++;
        } else if (response.data.data.status === 'failed') {
          payment.status = 'FAILED';
          await payment.save();
        }
      } catch (error) {
        logger.error(`Reconciliation failed for payment ${payment._id}:`, error);
      }
    }
    return count;
  }

  // ------------------------------------------------------------------
  // Subscription / SMS top-up
  // ------------------------------------------------------------------

  static async handleSubscriptionPayment(schoolId: string, planId: string, reference: string) {
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) throw new NotFoundError('Plan not found');
    const subscription = await Subscription.findOne({ schoolId });
    if (!subscription) throw new NotFoundError('Subscription not found');

    subscription.isTrial = false;
    subscription.trialEndDate = undefined;
    subscription.status = 'ACTIVE';
    subscription.planId = plan._id;
    subscription.priceAtPurchase = plan.price;
    subscription.billingCycleAtPurchase = plan.billingCycle;
    const durationMap: Record<string, number> = { MONTHLY: 30, TERMLY: 90, ANNUAL: 365 };
    subscription.durationDaysAtPurchase = durationMap[plan.billingCycle] || 90;
    subscription.endDate = new Date(
      Date.now() + subscription.durationDaysAtPurchase * 24 * 60 * 60 * 1000
    );
    await subscription.save();
    await invalidateSubscriptionCache(schoolId);

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

  static async topUpSMS(schoolId: string, amount: number, reference: string) {
    const school = await School.findById(schoolId);
    if (!school) throw new NotFoundError('School not found');
    const credits = Math.floor(amount / (school.smsRate || 2000));
    if (credits <= 0) throw new BadRequestError('Amount too low to purchase credits');
    school.smsBalance += credits;
    await school.save();

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

  // ------------------------------------------------------------------
  // Whole-school receipt batch generation
  //
  // Flow: generate → progress-poll → print. A receipt represents a
  // completed transaction, so there's no edit step.
  // ------------------------------------------------------------------

  static async generateReceiptsForSchool(schoolId: string, startedBy: string) {
    const paidInvoices = await Invoice.find({ schoolId, status: 'PAID' }).select('_id');
    if (paidInvoices.length === 0) {
      throw new BadRequestError('No fully paid invoices found for this school');
    }

    const batch = new BatchJob({
      schoolId,
      type: 'RECEIPTS',
      status: 'PENDING',
      totalCount: paidInvoices.length,
      startedBy,
    });
    await batch.save();

    // 🔴 safeQueueAdd
    await safeQueueAdd(reportQueue, 'generate-school-receipts', {
      batchId: batch._id.toString(),
      schoolId,
    });

    return batch;
  }

  // Called by report.worker.ts, not directly by a controller.
  static async processReceiptBatch(batchId: string, schoolId: string) {
    const batch = await BatchJob.findById(batchId);
    if (!batch) {
      logger.error(`processReceiptBatch: batch ${batchId} not found`);
      return;
    }

    batch.status = 'PROCESSING';
    await batch.save();

    const paidInvoices = await Invoice.find({ schoolId, status: 'PAID' }).select('_id studentId');

    const CHUNK_SIZE = 5;
    for (let i = 0; i < paidInvoices.length; i += CHUNK_SIZE) {
      const chunk = paidInvoices.slice(i, i + CHUNK_SIZE);
      const results = await Promise.allSettled(
        chunk.map(async (inv) => {
          const payment = await Payment.findOne({
            invoiceId: inv._id,
            status: 'CONFIRMED',
          }).sort({ confirmedAt: -1 });
          if (!payment) throw new Error('No confirmed payment found for invoice');

          // 🔴 safeQueueAdd
          await safeQueueAdd(pdfQueue, 'generate-receipt', { paymentId: payment._id });
          return payment;
        })
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        batch.processedCount += 1;
        if (result.status === 'fulfilled') {
          batch.successCount += 1;
          batch.itemIds.push((result.value as any)._id);
        } else {
          batch.failureCount += 1;
          batch.failures.push({
            studentId: (chunk[j] as any).studentId?.toString(),
            reason: result.reason?.message || 'Unknown error',
          });
        }
      }
      await batch.save();
    }

    batch.status = 'COMPLETED';
    batch.completedAt = new Date();
    await batch.save();

    logger.info(`Receipt batch ${batchId} completed: ${batch.successCount}/${batch.totalCount} succeeded`);
  }

  static async getReceiptBatch(batchId: string, schoolId: string) {
    const batch = await BatchJob.findOne({ _id: batchId, schoolId, type: 'RECEIPTS' });
    if (!batch) throw new NotFoundError('Batch not found');
    return batch;
  }

  static async printReceiptBatch(batchId: string, schoolId: string): Promise<Buffer> {
    const batch = await BatchJob.findOne({ _id: batchId, schoolId, type: 'RECEIPTS' });
    if (!batch) throw new NotFoundError('Batch not found');
    if (batch.status !== 'COMPLETED') {
      throw new BadRequestError('Batch has not finished processing yet');
    }

    const MAX_WAIT_MS = 15_000;
    const POLL_INTERVAL_MS = 1_000;
    const deadline = Date.now() + MAX_WAIT_MS;

    let payments = await Payment.find({
      _id: { $in: batch.itemIds },
      receiptUrl: { $ne: null },
    });

    while (payments.length < batch.itemIds.length && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      payments = await Payment.find({
        _id: { $in: batch.itemIds },
        receiptUrl: { $ne: null },
      });
    }

    if (payments.length === 0) {
      throw new BadRequestError('No generated receipts found yet — try again shortly');
    }

    const urls = payments.map((p) => p.receiptUrl!).filter(Boolean);
    return mergePDFsFromUrls(urls);
  }
}
