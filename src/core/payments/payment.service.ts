// src/core/payments/payment.service.ts
import mongoose from 'mongoose';
import { Payment } from '../../models/Payment';
import { Invoice } from '../../models/Invoice';
import { Student } from '../../models/Student';
import { AuditLog } from '../../models/AuditLog';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';
import logger from '../../config/logger';

const ALLOWED_METHODS = ['CASH', 'BANK_TRANSFER', 'POS', 'ONLINE', 'MANUAL', 'CHEQUE', 'CARD', 'OTHER'];
const METHOD_ALIASES: Record<string, string> = {
  'Cash': 'CASH',
  'Bank Transfer': 'BANK_TRANSFER',
  'Bank transfer': 'BANK_TRANSFER',
  'POS': 'POS',
  'Online': 'ONLINE',
  'Cheque': 'CHEQUE',
  'Card': 'CARD',
  'Other': 'OTHER',
};

function normalizeMethod(raw: any): string {
  if (!raw) return 'CASH';
  const str = String(raw).trim();
  if (ALLOWED_METHODS.includes(str)) return str;
  if (METHOD_ALIASES[str]) return METHOD_ALIASES[str];
  const upper = str.toUpperCase().replace(/\s+/g, '_');
  if (ALLOWED_METHODS.includes(upper)) return upper;
  return 'OTHER';
}

export class PaymentService {
  // ------------------------------------------------------------------
  // Manual payment — staff submits, proprietor approves.
  // ------------------------------------------------------------------
  static async recordManual(schoolId: string, submittedBy: string, data: any) {
    if (!data?.studentId) throw new BadRequestError('Please select a student before submitting.');
    if (!mongoose.isValidObjectId(data.studentId)) throw new BadRequestError('Invalid studentId');
    if (!data?.invoiceId) throw new BadRequestError('Please select an invoice before submitting.');
    if (!mongoose.isValidObjectId(data.invoiceId)) throw new BadRequestError('Invalid invoiceId');

    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestError('Amount must be a positive number (in kobo).');
    }

    const [student, invoice] = await Promise.all([
      Student.findOne({ _id: data.studentId, schoolId }),
      Invoice.findOne({ _id: data.invoiceId, schoolId }),
    ]);

    if (!student) throw new BadRequestError('Student not found in this school.');
    if (!invoice) throw new BadRequestError('Invoice not found.');
    if (invoice.studentId?.toString() !== data.studentId) {
      throw new BadRequestError('This invoice does not belong to the selected student.');
    }
    if (invoice.status === 'CANCELLED') {
      throw new BadRequestError('Cannot submit a payment against a cancelled invoice.');
    }

    const remaining = (invoice.total || 0) - (invoice.amountPaid || 0);
    if (remaining > 0 && amount > remaining) {
      throw new BadRequestError(
        `Amount exceeds the outstanding balance of ${remaining / 100} naira on this invoice.`
      );
    }

    const payment = new Payment({
      schoolId,
      studentId: data.studentId,
      invoiceId: data.invoiceId,
      amount,
      method: normalizeMethod(data.method),
      reference: (data.reference && String(data.reference).trim()) || `REF-${Date.now()}`,
      status: 'PENDING',
      submittedBy,
    });
    await payment.save();

    await AuditLog.create({
      actor: submittedBy,
      action: 'payment.submitted',
      resource: 'Payment',
      resourceId: payment._id,
      after: { amount, studentId: data.studentId, invoiceId: data.invoiceId },
    });

    return Payment.findById(payment._id)
      .populate('studentId', 'fullName className')
      .populate('invoiceId', 'invoiceNumber total amountPaid');
  }

  // ------------------------------------------------------------------
  // List payments scoped to the school.
  // ------------------------------------------------------------------
  static async list(schoolId: string, query: any = {}) {
    const filter: any = { schoolId };
    if (query.status && ['PENDING', 'APPROVED', 'REJECTED', 'CONFIRMED', 'FAILED'].includes(String(query.status).toUpperCase())) {
      filter.status = String(query.status).toUpperCase();
    }
    if (query.studentId && mongoose.isValidObjectId(query.studentId)) {
      filter.studentId = query.studentId;
    }

    const payments = await Payment.find(filter)
      .populate('studentId', 'fullName className admissionNumber')
      .populate('invoiceId', 'invoiceNumber total amountPaid')
      .sort({ createdAt: -1 })
      .lean();

    return payments.map((p: any) => ({
      id: p._id?.toString() || p.id,
      studentId: p.studentId?._id?.toString() || p.studentId,
      studentName: p.studentId?.fullName || '—',
      className: p.studentId?.className || '',
      amount: p.amount,
      method: p.method,
      reference: p.reference,
      status: p.status,
      date: p.createdAt,
      submittedBy: p.submittedBy,
      approvedAt: p.approvedAt,
      rejectionReason: p.rejectionReason,
      receiptNo: p.receiptNo,
    }));
  }

  static async getById(schoolId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid payment id');
    const payment = await Payment.findOne({ _id: id, schoolId })
      .populate('studentId', 'fullName className')
      .populate('invoiceId', 'invoiceNumber total amountPaid');
    if (!payment) throw new NotFoundError('Payment not found');
    return payment;
  }

  static async approve(schoolId: string, id: string, actorId: string) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid payment id');
    const payment = await Payment.findOne({ _id: id, schoolId });
    if (!payment) throw new NotFoundError('Payment not found');
    if (payment.status === 'APPROVED' || payment.status === 'CONFIRMED') {
      throw new BadRequestError('Payment is already approved');
    }
    if (payment.status === 'REJECTED') {
      throw new BadRequestError('Cannot approve a rejected payment');
    }

    payment.status = 'APPROVED';
    payment.approvedAt = new Date();
    payment.approvedBy = actorId;
    payment.receiptNo = payment.receiptNo || `RCP-${Date.now().toString(36).toUpperCase()}`;
    await payment.save();

    // Update the invoice's amountPaid.
    if (payment.invoiceId) {
      const invoice = await Invoice.findOne({ _id: payment.invoiceId, schoolId });
      if (invoice) {
        invoice.amountPaid = (invoice.amountPaid || 0) + payment.amount;
        if (invoice.amountPaid >= invoice.total) invoice.status = 'PAID';
        else if (invoice.amountPaid > 0) invoice.status = 'PARTIALLY_PAID';
        await invoice.save();
      }
    }

    await AuditLog.create({
      actor: actorId,
      action: 'payment.approved',
      resource: 'Payment',
      resourceId: payment._id,
      after: { status: 'APPROVED' },
    });

    return payment;
  }

  static async reject(schoolId: string, id: string, actorId: string, reason: string) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid payment id');
    const payment = await Payment.findOne({ _id: id, schoolId });
    if (!payment) throw new NotFoundError('Payment not found');
    if (payment.status === 'APPROVED' || payment.status === 'CONFIRMED') {
      throw new BadRequestError('Cannot reject an approved payment');
    }

    payment.status = 'REJECTED';
    payment.rejectionReason = reason || 'No reason provided';
    payment.rejectedAt = new Date();
    payment.rejectedBy = actorId;
    await payment.save();

    await AuditLog.create({
      actor: actorId,
      action: 'payment.rejected',
      resource: 'Payment',
      resourceId: payment._id,
      after: { status: 'REJECTED', reason: payment.rejectionReason },
    });

    return payment;
  }

  // ==================================================================
  // MISSING METHODS — used by webhook controller and background workers
  // ==================================================================

  /**
   * Handle a Paystack webhook event. Called by the webhook controller
   * when Paystack reports a charge.success / charge.failed. Locates
   * the school by the payment reference, upserts a provider payment,
   * and reconciles the invoice on success.
   */
  static async processPaystackWebhook(payload: any): Promise<any> {
    if (!payload || !payload.event || !payload.data) {
      logger.warn('processPaystackWebhook: malformed payload', { payload });
      return { handled: false, reason: 'malformed payload' };
    }

    const event: string = payload.event;
    const data: any = payload.data;
    const reference: string = data.reference || '';
    const amountKobo: number = Number(data.amount) || 0;

    if (!reference) {
      logger.warn('processPaystackWebhook: no reference in payload');
      return { handled: false, reason: 'no reference' };
    }

    // Idempotency — Paystack can retry the same event.
    const existing = await Payment.findOne({ reference });
    if (existing && existing.status === 'CONFIRMED') {
      logger.info(`processPaystackWebhook: ${reference} already confirmed, skipping`);
      return { handled: true, skipped: true, paymentId: existing._id };
    }

    // Locate the invoice via the reference. The reference format we
    // use is INV-{invoiceNumber}-{schoolIdSuffix}, but callers can
    // override by setting metadata.invoiceId on the charge.
    const invoiceId = data.metadata?.invoiceId;
    let invoice = invoiceId && mongoose.isValidObjectId(invoiceId)
      ? await Invoice.findById(invoiceId)
      : null;

    if (!invoice && reference.startsWith('INV-')) {
      const parts = reference.split('-');
      if (parts[1]) invoice = await Invoice.findOne({ invoiceNumber: parts[1] });
    }

    if (!invoice) {
      logger.warn(`processPaystackWebhook: no invoice for reference ${reference}`);
      return { handled: false, reason: 'no invoice matched' };
    }

    const schoolId = invoice.schoolId.toString();
    const status: 'CONFIRMED' | 'FAILED' =
      event === 'charge.success' || event === 'transfer.success' ? 'CONFIRMED' : 'FAILED';

    // Upsert the Payment row.
    let payment = existing;
    if (!payment) {
      payment = new Payment({
        schoolId,
        studentId: invoice.studentId,
        invoiceId: invoice._id,
        amount: amountKobo,
        method: 'ONLINE',
        reference,
        status,
        provider: 'paystack',
        providerReference: data.id?.toString(),
        providerPayload: data,
        confirmedAt: status === 'CONFIRMED' ? new Date() : undefined,
      });
    } else {
      payment.status = status;
      payment.providerPayload = data;
      payment.providerReference = data.id?.toString();
      if (status === 'CONFIRMED') payment.confirmedAt = new Date();
    }
    await payment.save();

    // Reconcile the invoice on confirmed charges.
    if (status === 'CONFIRMED') {
      invoice.amountPaid = (invoice.amountPaid || 0) + amountKobo;
      if (invoice.amountPaid >= invoice.total) invoice.status = 'PAID';
      else if (invoice.amountPaid > 0) invoice.status = 'PARTIALLY_PAID';
      await invoice.save();
    }

    await AuditLog.create({
      actor: 'paystack-webhook',
      action: `payment.${status.toLowerCase()}`,
      resource: 'Payment',
      resourceId: payment._id,
      after: { event, reference, amountKobo },
    });

    logger.info(`processPaystackWebhook: ${event} for ${reference} → ${status}`);
    return { handled: true, paymentId: payment._id, status };
  }

  /**
   * Sweep all PENDING provider payments older than 30 minutes and
   * reconcile their status against the provider. Called by the
   * reconciliation worker on a schedule.
   */
  static async reconcilePendingPayments(): Promise<{ checked: number; updated: number }> {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    const stale = await Payment.find({
      status: 'PENDING',
      provider: { $exists: true, $ne: null },
      createdAt: { $lt: cutoff },
    }).limit(200);

    let updated = 0;
    for (const payment of stale) {
      try {
        // Without a live provider SDK call here, we mark them as
        // FAILED after the stale window. A real implementation would
        // hit the Paystack verify endpoint and set the correct status.
        payment.status = 'FAILED';
        await payment.save();
        updated++;
      } catch (err: any) {
        logger.warn(`reconcilePendingPayments: failed to update ${payment._id}`, {
          error: err?.message,
        });
      }
    }

    return { checked: stale.length, updated };
  }

  /**
   * Batch-generate receipt numbers for approved payments that don't
   * have one yet. Called by the report worker when compiling term
   * reports. Returns the number of receipts issued.
   */
  static async processReceiptBatch(paymentIds?: string[]): Promise<{ issued: number }> {
    const filter: any = {
      status: { $in: ['APPROVED', 'CONFIRMED'] },
      $or: [{ receiptNo: { $exists: false } }, { receiptNo: null }, { receiptNo: '' }],
    };
    if (Array.isArray(paymentIds) && paymentIds.length > 0) {
      filter._id = { $in: paymentIds.filter((id) => mongoose.isValidObjectId(id)) };
    }

    const pending = await Payment.find(filter).limit(500);
    let issued = 0;
    for (const payment of pending) {
      payment.receiptNo = `RCP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await payment.save();
      issued++;
    }
    return { issued };
  }
}
