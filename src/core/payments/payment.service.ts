import { Payment } from '../../models/Payment';
import { Invoice } from '../../models/Invoice';
import { LedgerEntry } from '../../models/LedgerEntry';
import { AuditLog } from '../../models/AuditLog';
import { Parent } from '../../models/Parent';
import { Student } from '../../models/Student';
import { Subscription } from '../../models/Subscription';
import { SubscriptionPlan } from '../../models/SubscriptionPlan';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { redis, acquireLock, releaseLock } from '../../config/redis';
import { smsQueue, emailQueue, pdfQueue, automationQueue } from '../../jobs/queues';
import logger from '../../config/logger';
import { env } from '../../config/env';
import mongoose from 'mongoose';
import axios from 'axios';
import { invalidateSubscriptionCache } from '../../middleware/subscription.middleware';

export class PaymentService {
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

      const invoiceNumber = data.metadata?.invoiceNumber;
      if (!invoiceNumber) throw new BadRequestError('Invoice number missing in metadata');

      const invoice = await Invoice.findOne({ invoiceNumber });
      if (!invoice) throw new NotFoundError('Invoice not found');

      const paystackAmount = data.amount; // kobo
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

        const ledgerEntry = new LedgerEntry({
          schoolId: invoice.schoolId,
          invoiceId: invoice._id,
          studentId: invoice.studentId,
          amount: paystackAmount,
          type: 'CREDIT',
          category: 'PAYMENT',
          description: `Payment via Paystack, ref ${reference}`,
          reference,
        });
        await ledgerEntry.save({ session });

        const audit = new AuditLog({
          actor: 'paystack-webhook',
          schoolId: invoice.schoolId,
          action: 'payment.confirmed',
          resource: 'Payment',
          resourceId: payment._id,
          after: { amount: paystackAmount, invoice: invoice._id },
        });
        await audit.save({ session });

        // --- RENEWAL BRIDGE: if invoice is fully paid, extend subscription using frozen duration ---
        if (invoice.balance <= 0) {
          const subscription = await Subscription.findOne({ 
            schoolId: invoice.schoolId,
            status: { $in: ['ACTIVE', 'EXPIRED', 'PAST_DUE'] }
          });
          if (subscription) {
            const daysToAdd = subscription.durationDaysAtPurchase || 90;
            subscription.endDate = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);
            subscription.status = 'ACTIVE';
            await subscription.save({ session });

            await invalidateSubscriptionCache(invoice.schoolId.toString());

            await AuditLog.create({
              actor: 'system',
              schoolId: invoice.schoolId,
              action: 'subscription.renewed',
              resource: 'Subscription',
              resourceId: subscription._id,
              after: { endDate: subscription.endDate },
            });
            logger.info(`Subscription ${subscription._id} renewed via webhook payment`);
          }
        }

        await session.commitTransaction();
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }

      // Queue side effects after commit
      await pdfQueue.add('generate-receipt', { paymentId: payment._id });
      await emailQueue.add('send-payment-confirmation', { paymentId: payment._id });

      // Fetch parent phone
      const student = await Student.findById(invoice.studentId).populate('parentIds');
      let parentPhone = null;
      if (student && student.parentIds && student.parentIds.length > 0) {
        const parent = await Parent.findById(student.parentIds[0]);
        if (parent) parentPhone = parent.phone;
      }
      if (parentPhone) {
        await smsQueue.add('send-sms', {
          to: parentPhone,
          message: `Payment of ₦${(paystackAmount / 100).toFixed(2)} received. Invoice ${invoiceNumber}`,
          senderId: env.SMS_SENDER_ID,
        });
      } else {
        logger.warn(`No parent phone for student ${invoice.studentId}`);
      }

      await automationQueue.add('automation-trigger', {
        event: 'payment_received',
        data: { paymentId: payment._id, invoiceId: invoice._id, schoolId: invoice.schoolId },
      });

      logger.info(`Payment processed successfully for invoice ${invoiceNumber}`);
      return payment;
    } finally {
      await releaseLock(lockKey, lockToken);
    }
  }

  static async recordManualPayment(paymentData: any) {
    const { schoolId, invoiceId, amount, method, receivedBy, reference } = paymentData;
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) throw new NotFoundError('Invoice not found');

    const payment = new Payment({
      schoolId,
      invoiceId,
      studentId: invoice.studentId,
      amount: amount * 100, // convert to kobo if input in naira
      method,
      reference: reference || `MANUAL-${Date.now()}`,
      status: 'PENDING',
      receivedBy,
    });
    await payment.save();
    await emailQueue.add('send-payment-approval-request', { paymentId: payment._id });
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
      payment.receivedBy = approverId;
      await payment.save({ session });

      invoice.amountPaid += payment.amount;
      invoice.balance = invoice.total - invoice.amountPaid;
      invoice.status = invoice.balance <= 0 ? 'PAID' : 'PARTIALLY_PAID';
      await invoice.save({ session });

      const ledgerEntry = new LedgerEntry({
        schoolId: invoice.schoolId,
        invoiceId: invoice._id,
        studentId: invoice.studentId,
        amount: payment.amount,
        type: 'CREDIT',
        category: 'PAYMENT',
        description: `Manual payment approved by ${approverId}`,
        reference: payment.reference,
      });
      await ledgerEntry.save({ session });

      // --- RENEWAL BRIDGE: if invoice is fully paid, extend subscription using frozen duration ---
      if (invoice.balance <= 0) {
        const subscription = await Subscription.findOne({ 
          schoolId: invoice.schoolId,
          status: { $in: ['ACTIVE', 'EXPIRED', 'PAST_DUE'] }
        });
        if (subscription) {
          const daysToAdd = subscription.durationDaysAtPurchase || 90;
          subscription.endDate = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);
          subscription.status = 'ACTIVE';
          await subscription.save({ session });

          await invalidateSubscriptionCache(invoice.schoolId.toString());

          await AuditLog.create({
            actor: 'system',
            schoolId: invoice.schoolId,
            action: 'subscription.renewed',
            resource: 'Subscription',
            resourceId: subscription._id,
            after: { endDate: subscription.endDate },
          });
          logger.info(`Subscription ${subscription._id} renewed via manual approval`);
        }
      }

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

    await pdfQueue.add('generate-receipt', { paymentId: payment._id });
    await emailQueue.add('send-payment-confirmation', { paymentId: payment._id });
    return payment;
  }

  // Reconciliation: fetch pending payments from Paystack
  static async reconcilePendingPayments() {
    const pendingPayments = await Payment.find({
      status: 'PENDING',
      method: 'ONLINE',
      createdAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) }, // older than 10 min
    });
    for (const payment of pendingPayments) {
      try {
        const response = await axios.get(
          `https://api.paystack.co/transaction/verify/${payment.reference}`,
          { headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` } }
        );
        if (response.data.data.status === 'success') {
          await this.processPaystackWebhook({
            event: 'charge.success',
            data: response.data.data,
          });
        } else if (response.data.data.status === 'failed') {
          payment.status = 'FAILED';
          await payment.save();
        }
      } catch (error) {
        logger.error(`Reconciliation failed for payment ${payment._id}:`, error);
      }
    }
    return pendingPayments.length;
  }
}
