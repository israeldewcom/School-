// src/core/payments/payment.service.ts
import mongoose from 'mongoose';
import { Payment } from '../../models/Payment';
import { Invoice } from '../../models/Invoice';
import { Student } from '../../models/Student';
import { User } from '../../models/User';
import { AuditLog } from '../../models/AuditLog';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';
//import logger from '../../config/logger';

const ALLOWED_METHODS = ['CASH', 'BANK_TRANSFER', 'POS', 'ONLINE', 'MANUAL', 'CHEQUE', 'CARD', 'OTHER'];
const METHOD_ALIASES: Record<string, string> = {
  'Cash': 'CASH', 'cash': 'CASH',
  'Bank Transfer': 'BANK_TRANSFER', 'Bank transfer': 'BANK_TRANSFER', 'Bank': 'BANK_TRANSFER',
  'POS': 'POS', 'pos': 'POS',
  'Online': 'ONLINE', 'online': 'ONLINE',
  'Cheque': 'CHEQUE', 'cheque': 'CHEQUE', 'Check': 'CHEQUE',
  'Card': 'CARD', 'card': 'CARD',
  'Manual': 'MANUAL', 'manual': 'MANUAL',
  'Other': 'OTHER', 'other': 'OTHER',
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

// Roles that can self-approve — their submissions reconcile immediately.
const AUTO_APPROVE_ROLES = ['SUPER_ADMIN', 'SCHOOL_OWNER'];

export class PaymentService {
  /**
   * Submit a payment.
   *
   * When the submitter is the owner or super admin, the payment is
   * approved and applied to the invoice immediately (one step).
   * When the submitter is staff (bursar, admin), it goes to PENDING
   * and waits for owner approval (two steps).
   */
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
    if (String(invoice.studentId) !== data.studentId) {
      throw new BadRequestError('This invoice does not belong to the selected student.');
    }
    if (invoice.status === 'CANCELLED') {
      throw new BadRequestError('Cannot submit a payment against a cancelled invoice.');
    }

    const remaining = (invoice.total || 0) - (invoice.amountPaid || 0);
    if (remaining > 0 && amount > remaining) {
      throw new BadRequestError(
        `Amount exceeds the outstanding balance of ₦${(remaining / 100).toLocaleString('en-NG')} on this invoice.`
      );
    }

    // Determine whether the submitter can self-approve.
    let autoApprove = false;
    try {
      const actor = await User.findById(submittedBy).select('role').lean();
      if (actor && AUTO_APPROVE_ROLES.includes((actor as any).role)) {
        autoApprove = true;
      }
    } catch (_) {}

    const now = new Date();
    const receiptSeq = `${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;

    const payment = new Payment({
      schoolId,
      studentId: data.studentId,
      invoiceId: data.invoiceId,
      amount,
      method: normalizeMethod(data.method),
      reference: (data.reference && String(data.reference).trim()) || `REF-${receiptSeq}`,
      status: autoApprove ? 'APPROVED' : 'PENDING',
      submittedBy,
      ...(autoApprove ? {
        approvedAt: now,
        approvedBy: submittedBy,
        receiptNo: `RCP-${receiptSeq}`,
      } : {}),
    });
    await payment.save();

    // If auto-approved, reconcile the invoice right now so the student's
    // outstanding balance reflects immediately.
    if (autoApprove) {
      invoice.amountPaid = (invoice.amountPaid || 0) + amount;
      if (invoice.amountPaid >= invoice.total) invoice.status = 'PAID';
      else if (invoice.amountPaid > 0) invoice.status = 'PARTIALLY_PAID';
      await invoice.save();
    }

    try {
      await AuditLog.create({
        actor: submittedBy,
        action: autoApprove ? 'payment.submitted_and_approved' : 'payment.submitted',
        resource: 'Payment',
        resourceId: payment._id,
        after: { amount, studentId: data.studentId, invoiceId: data.invoiceId, autoApprove },
      });
    } catch (_) {}

    return PaymentService.getById(schoolId, String(payment._id));
  }

  static async list(schoolId: string, query: any = {}) {
    const filter: any = { schoolId };
    if (query.status) {
      const s = String(query.status).toUpperCase();
      if (['PENDING', 'APPROVED', 'REJECTED', 'CONFIRMED', 'FAILED'].includes(s)) {
        filter.status = s;
      }
    }
    if (query.studentId && mongoose.isValidObjectId(query.studentId)) {
      filter.studentId = query.studentId;
    }

    const payments = await Payment.find(filter)
      .populate('studentId', 'firstName lastName fullName className admissionNumber')
      .populate('invoiceId', 'invoiceNumber total amountPaid')
      .sort({ createdAt: -1 })
      .lean();

    return payments.map((p: any) => PaymentService.shapeList(p));
  }

  static shapeList(p: any) {
    const student = p.studentId || {};
    const fullName =
      student.fullName ||
      `${student.firstName || ''} ${student.lastName || ''}`.trim() ||
      '—';
    return {
      id: String(p._id),
      studentId: student._id ? String(student._id) : String(p.studentId || ''),
      studentName: fullName,
      className: student.className || '',
      admissionNumber: student.admissionNumber || '',
      invoiceId: p.invoiceId?._id ? String(p.invoiceId._id) : String(p.invoiceId || ''),
      invoiceNumber: p.invoiceId?.invoiceNumber || null,
      amount: p.amount,
      method: p.method,
      reference: p.reference,
      status: p.status,
      date: p.createdAt,
      approvedAt: p.approvedAt,
      rejectedAt: p.rejectedAt,
      rejectionReason: p.rejectionReason,
      submittedBy: p.submittedBy,
      receiptNo: p.receiptNo,
      receiptUrl: p.receiptUrl,
    };
  }

  static async getById(schoolId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid payment id');
    const payment = await Payment.findOne({ _id: id, schoolId })
      .populate('studentId', 'firstName lastName fullName className admissionNumber guardianPhone')
      .populate('invoiceId', 'invoiceNumber total amountPaid dueDate status');
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

    if (payment.invoiceId) {
      const invoice = await Invoice.findOne({ _id: payment.invoiceId, schoolId });
      if (invoice) {
        invoice.amountPaid = (invoice.amountPaid || 0) + payment.amount;
        if (invoice.amountPaid >= invoice.total) invoice.status = 'PAID';
        else if (invoice.amountPaid > 0) invoice.status = 'PARTIALLY_PAID';
        await invoice.save();
      }
    }

    try {
      await AuditLog.create({
        actor: actorId,
        action: 'payment.approved',
        resource: 'Payment',
        resourceId: payment._id,
        after: { status: 'APPROVED' },
      });
    } catch (_) {}

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

    try {
      await AuditLog.create({
        actor: actorId,
        action: 'payment.rejected',
        resource: 'Payment',
        resourceId: payment._id,
        after: { status: 'REJECTED', reason: payment.rejectionReason },
      });
    } catch (_) {}

    return payment;
  }

  static async processPaystackWebhook(payload: any): Promise<any> {
    if (!payload?.event || !payload?.data) {
      return { handled: false, reason: 'malformed payload' };
    }
    const event = payload.event;
    const data = payload.data;
    const reference = data.reference || '';
    const amountKobo = Number(data.amount) || 0;
    if (!reference) return { handled: false, reason: 'no reference' };

    const existing = await Payment.findOne({ reference });
    if (existing && (existing.status === 'CONFIRMED' || existing.status === 'APPROVED')) {
      return { handled: true, skipped: true, paymentId: existing._id };
    }

    const invoiceId = data.metadata?.invoiceId;
    let invoice = invoiceId && mongoose.isValidObjectId(invoiceId)
      ? await Invoice.findById(invoiceId)
      : null;
    if (!invoice && reference.startsWith('INV-')) {
      const parts = reference.split('-');
      if (parts[1]) invoice = await Invoice.findOne({ invoiceNumber: parts[1] });
    }
    if (!invoice) return { handled: false, reason: 'no invoice matched' };

    const schoolId = String(invoice.schoolId);
    const status: 'CONFIRMED' | 'FAILED' =
      event === 'charge.success' || event === 'transfer.success' ? 'CONFIRMED' : 'FAILED';

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
        providerReference: data.id ? String(data.id) : undefined,
        providerPayload: data,
        confirmedAt: status === 'CONFIRMED' ? new Date() : undefined,
      });
    } else {
      payment.status = status;
      payment.providerPayload = data;
      if (status === 'CONFIRMED') payment.confirmedAt = new Date();
    }
    await payment.save();

    if (status === 'CONFIRMED' && (!existing || existing.status !== 'APPROVED')) {
      invoice.amountPaid = (invoice.amountPaid || 0) + amountKobo;
      if (invoice.amountPaid >= invoice.total) invoice.status = 'PAID';
      else if (invoice.amountPaid > 0) invoice.status = 'PARTIALLY_PAID';
      await invoice.save();
    }

    return { handled: true, paymentId: payment._id, status };
  }

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
        payment.status = 'FAILED';
        await payment.save();
        updated++;
      } catch (_) {}
    }
    return { checked: stale.length, updated };
  }

  static async processReceiptBatch(first?: string | string[], second?: string) {
    const filter: any = {
      status: { $in: ['APPROVED', 'CONFIRMED'] },
      $or: [{ receiptNo: { $exists: false } }, { receiptNo: null }, { receiptNo: '' }],
    };
    if (Array.isArray(first)) {
      const ids = first.filter((id) => mongoose.isValidObjectId(id));
      if (ids.length > 0) filter._id = { $in: ids };
    } else if (typeof first === 'string' && mongoose.isValidObjectId(first)) {
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
        `RCP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await payment.save();
      issued++;
    }
    return { issued };
  }
}
