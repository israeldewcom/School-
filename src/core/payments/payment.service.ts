// src/core/payments/payment.service.ts
import mongoose from 'mongoose';
import { Payment } from '../../models/Payment';
import { Invoice } from '../../models/Invoice';
import { Student } from '../../models/Student';
import { AuditLog } from '../../models/AuditLog';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';
import logger from '../../config/logger';

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------
const ALLOWED_METHODS = [
  'CASH',
  'BANK_TRANSFER',
  'POS',
  'ONLINE',
  'MANUAL',
  'CHEQUE',
  'CARD',
  'OTHER',
] as const;

const METHOD_ALIASES: Record<string, string> = {
  'Cash': 'CASH',
  'cash': 'CASH',
  'Bank Transfer': 'BANK_TRANSFER',
  'Bank transfer': 'BANK_TRANSFER',
  'bank transfer': 'BANK_TRANSFER',
  'Bank': 'BANK_TRANSFER',
  'bank': 'BANK_TRANSFER',
  'POS': 'POS',
  'pos': 'POS',
  'Online': 'ONLINE',
  'online': 'ONLINE',
  'Cheque': 'CHEQUE',
  'cheque': 'CHEQUE',
  'Check': 'CHEQUE',
  'Card': 'CARD',
  'card': 'CARD',
  'Manual': 'MANUAL',
  'manual': 'MANUAL',
  'Other': 'OTHER',
  'other': 'OTHER',
};

/**
 * Normalize a raw method input (enum, alias, or free text) to a
 * canonical uppercase value the schema accepts. Falls back to OTHER
 * so callers never see a validation error from this field.
 */
function normalizeMethod(raw: any): string {
  if (!raw) return 'CASH';
  const str = String(raw).trim();
  if ((ALLOWED_METHODS as readonly string[]).includes(str)) return str;
  if (METHOD_ALIASES[str]) return METHOD_ALIASES[str];
  const upper = str.toUpperCase().replace(/\s+/g, '_');
  if ((ALLOWED_METHODS as readonly string[]).includes(upper)) return upper;
  return 'OTHER';
}

// ------------------------------------------------------------------
// Service
// ------------------------------------------------------------------
export class PaymentService {
  // ==================================================================
  // 1. MANUAL PAYMENT WORKFLOW (submit → approve/reject)
  // ==================================================================

  /**
   * Staff submits a manual payment. Everything lands as PENDING and
   * waits for proprietor approval. Every field is validated up front
   * so invalid input produces a 400 with a useful message instead of
   * a Mongoose CastError that would surface as a 500.
   */
  static async recordManual(schoolId: string, submittedBy: string, data: any) {
    if (!data?.studentId) {
      throw new BadRequestError('Please select a student before submitting.');
    }
    if (!mongoose.isValidObjectId(data.studentId)) {
      throw new BadRequestError('Invalid studentId');
    }
    if (!data?.invoiceId) {
      throw new BadRequestError('Please select an invoice before submitting.');
    }
    if (!mongoose.isValidObjectId(data.invoiceId)) {
      throw new BadRequestError('Invalid invoiceId');
    }

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
    if (invoice.status === 'PAID') {
      throw new BadRequestError('This invoice is already fully paid.');
    }

    const remaining = (invoice.total || 0) - (invoice.amountPaid || 0);
    if (remaining > 0 && amount > remaining) {
      throw new BadRequestError(
        `Amount exceeds the outstanding balance of ₦${(remaining / 100).toLocaleString('en-NG')} on this invoice.`
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

    // Return populated shape so the frontend can render the row
    // without a second round trip.
    return Payment.findById(payment._id)
      .populate('studentId', 'fullName className admissionNumber')
      .populate('invoiceId', 'invoiceNumber total amountPaid');
  }

  /**
   * Proprietor approves a PENDING payment. On success, updates the
   * linked invoice's amountPaid and status, and issues a receipt
   * number if the payment doesn't already have one.
   */
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
    payment.receiptNo =
      payment.receiptNo || `RCP-${Date.now().toString(36).toUpperCase()}`;
    await payment.save();

    // Reconcile the invoice if we're linked to one.
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
      after: { status: 'APPROVED', receiptNo: payment.receiptNo },
    });

    return payment;
  }

  /**
   * Proprietor rejects a PENDING payment. Stores the reason so the
   * submitter knows why. Rejected payments never touch the invoice.
   */
  static async reject(schoolId: string, id: string, actorId: string, reason: string) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid payment id');

    const payment = await Payment.findOne({ _id: id, schoolId });
    if (!payment) throw new NotFoundError('Payment not found');

    if (payment.status === 'APPROVED' || payment.status === 'CONFIRMED') {
      throw new BadRequestError('Cannot reject an approved payment');
    }
    if (payment.status === 'REJECTED') {
      throw new BadRequestError('Payment is already rejected');
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
  // 2. READ OPERATIONS
  // ==================================================================

  /**
   * List payments scoped to the school, with optional filters.
   * Flattens the populated student so the frontend can consume it
   * directly.
   */
  static async list(schoolId: string, query: any = {}) {
    const filter: any = { schoolId };

    if (
      query.status &&
      ['PENDING', 'APPROVED', 'REJECTED', 'CONFIRMED', 'FAILED'].includes(
        String(query.status).toUpperCase()
      )
    ) {
      filter.status = String(query.status).toUpperCase();
    }
    if (query.studentId && mongoose.isValidObjectId(query.studentId)) {
      filter.studentId = query.studentId;
    }
    if (query.invoiceId && mongoose.isValidObjectId(query.invoiceId)) {
      filter.invoiceId = query.invoiceId;
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
      admissionNumber: p.studentId?.admissionNumber || '',
      invoiceId: p.invoiceId?._id?.toString() || p.invoiceId,
      invoiceNumber: p.invoiceId?.invoiceNumber || null,
      amount: p.amount,
      method: p.method,
      reference: p.reference,
      status: p.status,
      date: p.createdAt,
      submittedBy: p.submittedBy,
      approvedAt: p.approvedAt,
      rejectedAt: p.rejectedAt,
      rejectionReason: p.rejectionReason,
      receiptNo: p.receiptNo,
      receiptUrl: p.receiptUrl,
    }));
  }

  /**
   * Single payment by id, with populated relations. Used by the
   * receipt modal and the payment detail view.
   */
  static async getById(schoolId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid payment id');

    const payment = await Payment.findOne({ _id: id, schoolId })
      .populate('studentId', 'fullName className admissionNumber guardianPhone')
      .populate('invoiceId', 'invoiceNumber total amountPaid dueDate status');

    if (!payment) throw new NotFoundError('Payment not found');
    return payment;
  }

  // ==================================================================
  // 3. PAYSTACK WEBHOOK HANDLER
  // ==================================================================

  /**
   * Handle a Paystack webhook event. Called by the webhook controller
   * when Paystack reports a charge success or failure.
   *
   * Flow:
   *   1. Idempotency check via reference
   *   2. Locate the invoice from metadata or reference pattern
   *   3. Upsert a Payment row with the provider status
   *   4. Reconcile the invoice on confirmed charges
   *   5. Audit log
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

    // Idempotency — Paystack retries on our non-2xx responses and
    // occasionally duplicates events. Skip if already processed.
    const existing = await Payment.findOne({ reference });
    if (existing && (existing.status === 'CONFIRMED' || existing.status === 'APPROVED')) {
      logger.info(`processPaystackWebhook: ${reference} already processed, skipping`);
      return { handled: true, skipped: true, paymentId: existing._id };
    }

    // Locate the invoice. Preferred path: metadata.invoiceId set by
    // the payment link. Fallback: parse INV-{invoiceNumber}-... from
    // the reference.
    const invoiceId = data.metadata?.invoiceId;
    let invoice = invoiceId && mongoose.isValidObjectId(invoiceId)
      ? await Invoice.findById(invoiceId)
      : null;

    if (!invoice && reference.startsWith('INV-')) {
      const parts = reference.split('-');
      if (parts[1]) {
        invoice = await Invoice.findOne({ invoiceNumber: parts[1] });
      }
    }

    if (!invoice) {
      logger.warn(`processPaystackWebhook: no invoice for reference ${reference}`);
      return { handled: false, reason: 'no invoice matched' };
    }

    const schoolId = invoice.schoolId.toString();
    const status: 'CONFIRMED' | 'FAILED' =
      event === 'charge.success' || event === 'transfer.success'
        ? 'CONFIRMED'
        : 'FAILED';

    // Upsert the Payment row. If a manual payment with this reference
    // exists (rare but possible), we upgrade it in place.
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
      payment.provider = 'paystack';
      if (status === 'CONFIRMED') payment.confirmedAt = new Date();
    }
    await payment.save();

    // Reconcile the invoice on confirmed charges. Do NOT double-apply
    // if this payment was previously counted.
    if (status === 'CONFIRMED' && (!existing || existing.status !== 'APPROVED')) {
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
      after: { event, reference, amountKobo, status },
    });

    logger.info(`processPaystackWebhook: ${event} for ${reference} → ${status}`);
    return { handled: true, paymentId: payment._id, status };
  }

  // ==================================================================
  // 4. BACKGROUND WORKERS
  // ==================================================================

  /**
   * Sweep stale PENDING provider payments and mark them FAILED after
   * a grace window. Called by the reconciliation worker on schedule.
   *
   * A production implementation would call the provider's verify
   * endpoint here. We keep this conservative so a redeploy never
   * silently loses money.
   */
  static async reconcilePendingPayments(): Promise<{ checked: number; updated: number }> {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes

    const stale = await Payment.find({
      status: 'PENDING',
      provider: { $exists: true, $ne: null },
      createdAt: { $lt: cutoff },
    }).limit(200);

    let updated = 0;
    for (const payment of stale) {
      try {
        payment.status = 'FAILED';
        await payment.save();
        updated++;
      } catch (err: any) {
        logger.warn(`reconcilePendingPayments: failed to update ${payment._id}`, {
          error: err?.message,
        });
      }
    }

    if (stale.length > 0) {
      logger.info(`reconcilePendingPayments: checked ${stale.length}, updated ${updated}`);
    }
    return { checked: stale.length, updated };
  }

  /**
   * Batch-issue receipt numbers for approved payments that don't
   * have one yet.
   *
   * The signature accepts two call shapes because two callers use it
   * differently:
   *
   *   processReceiptBatch(schoolId, termId)      — report worker
   *   processReceiptBatch([id1, id2, id3])       — ad-hoc scripts
   *
   * Accepting both here prevents "Expected 0-1 arguments" at the
   * call site without forcing a caller change.
   */
  static async processReceiptBatch(
    first?: string | string[],
    second?: string
  ): Promise<{ issued: number }> {
    const filter: any = {
      status: { $in: ['APPROVED', 'CONFIRMED'] },
      $or: [
        { receiptNo: { $exists: false } },
        { receiptNo: null },
        { receiptNo: '' },
      ],
    };

    // Case A: array of payment ids.
    if (Array.isArray(first)) {
      const ids = first.filter((id) => mongoose.isValidObjectId(id));
      if (ids.length > 0) filter._id = { $in: ids };
    }
    // Case B: (schoolId, termId) — the report worker's call shape.
    else if (typeof first === 'string' && mongoose.isValidObjectId(first)) {
      filter.schoolId = first;
      if (typeof second === 'string' && mongoose.isValidObjectId(second)) {
        filter.termId = second;
      }
    }

    const pending = await Payment.find(filter).limit(500);

    let issued = 0;
    for (const payment of pending) {
      payment.receiptNo =
        payment.receiptNo ||
        `RCP-${Date.now().toString(36).toUpperCase()}-${Math.random()
          .toString(36)
          .slice(2, 6)
          .toUpperCase()}`;
      await payment.save();
      issued++;
    }

    if (issued > 0) {
      logger.info(`processReceiptBatch: issued ${issued} receipt numbers`);
    }
    return { issued };
  }
}
