// src/core/payments/payment.service.ts
import mongoose from 'mongoose';
import { Payment } from '../../models/Payment';
import { Invoice } from '../../models/Invoice';
import { Student } from '../../models/Student';
import { User } from '../../models/User';
import { AuditLog } from '../../models/AuditLog';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';
import { PaymentNotifier } from './payment.notifier';

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

    // Owners/super admins self-approve, and so do staff the owner has delegated approval to.
    let autoApprove = false;
    try {
      const actor: any = await User.findById(submittedBy).select('role canApprovePayments').lean();
      if (actor && (AUTO_APPROVE_ROLES.includes(actor.role) || actor.canApprovePayments === true)) {
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

    if (autoApprove) {
      await PaymentService.applyToInvoice(schoolId, String(invoice._id), amount);
      void PaymentNotifier.onPaymentApplied(schoolId, String(payment._id));
    } else {
      void PaymentNotifier.onPendingApproval(schoolId, String(payment._id));
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

  /**
   * List payments (plain array, frontend-compatible).
   * Query: status=PENDING|APPROVED|REJECTED|CONFIRMED|FAILED|ALL, statuses=A,B,
   *        studentId, invoiceId, q (name / admission no / reference / receipt no),
   *        from, to (dates), limit (default 500, max 2000), page.
   * status=APPROVED also includes CONFIRMED (online) payments.
   */
  static async list(schoolId: string, query: any = {}) {
    const VALID = ['PENDING', 'APPROVED', 'REJECTED', 'CONFIRMED', 'FAILED'];
    const filter: any = { schoolId };

    const wanted: string[] = [];
    if (query.statuses) {
      String(query.statuses).split(',').forEach((x) => {
        const u = x.trim().toUpperCase();
        if (VALID.includes(u)) wanted.push(u);
      });
    } else if (query.status && String(query.status).toUpperCase() !== 'ALL') {
      const u = String(query.status).toUpperCase();
      if (VALID.includes(u)) wanted.push(u);
    }
    if (wanted.includes('APPROVED') && !wanted.includes('CONFIRMED')) wanted.push('CONFIRMED');
    if (wanted.length) filter.status = { $in: wanted };

    if (query.studentId && mongoose.isValidObjectId(query.studentId)) filter.studentId = query.studentId;
    if (query.invoiceId && mongoose.isValidObjectId(query.invoiceId)) filter.invoiceId = query.invoiceId;

    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from && !isNaN(new Date(query.from).getTime())) filter.createdAt.$gte = new Date(query.from);
      if (query.to && !isNaN(new Date(query.to).getTime())) {
        const end = new Date(query.to);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
      if (!Object.keys(filter.createdAt).length) delete filter.createdAt;
    }

    const q = String(query.q || '').trim();
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const students = await Student.find({
        schoolId,
        $or: [{ fullName: rx }, { firstName: rx }, { lastName: rx }, { admissionNumber: rx }],
      }).select('_id').limit(200).lean();
      filter.$or = [
        { reference: rx },
        { receiptNo: rx },
        { studentId: { $in: students.map((x: any) => x._id) } },
      ];
    }

    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 500, 1), 2000);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);

    const payments = await Payment.find(filter)
      .populate('studentId', 'firstName lastName fullName className admissionNumber')
      .populate('invoiceId', 'invoiceNumber total amountPaid')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Resolve submitter / approver / rejecter names in one query.
    const userIds = new Set<string>();
    for (const p of payments as any[]) {
      [p.submittedBy, p.approvedBy, p.rejectedBy].forEach((u) => {
        if (u && mongoose.isValidObjectId(String(u))) userIds.add(String(u));
      });
    }
    const users: any[] = userIds.size
      ? await User.find({ _id: { $in: [...userIds] } }).select('name firstName lastName role').lean()
      : [];
    const nameOf = new Map<string, { name: string; role: string }>();
    for (const u of users) {
      nameOf.set(String(u._id), {
        name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Staff',
        role: u.role || '',
      });
    }

    return (payments as any[]).map((p) => PaymentService.shapeList(p, nameOf));
  }

  static shapeList(p: any, nameOf?: Map<string, { name: string; role: string }>) {
    const student = p.studentId || {};
    const fullName =
      student.fullName ||
      `${student.firstName || ''} ${student.lastName || ''}`.trim() ||
      '—';
    const who = (id: any) => (id && nameOf ? nameOf.get(String(id)) : undefined);
    const isApproved = p.status === 'APPROVED' || p.status === 'CONFIRMED';
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
      statusLabel: isApproved ? 'Approved' : p.status === 'PENDING' ? 'Pending approval' : p.status === 'REJECTED' ? 'Rejected' : 'Failed',
      source: p.provider ? 'ONLINE' : 'MANUAL',
      date: p.createdAt,
      approvedAt: p.approvedAt || p.confirmedAt || null,
      rejectedAt: p.rejectedAt,
      rejectionReason: p.rejectionReason,
      submittedBy: p.submittedBy,
      submittedByName: who(p.submittedBy)?.name || null,
      approvedByName: who(p.approvedBy)?.name || null,
      rejectedByName: who(p.rejectedBy)?.name || null,
      receiptNo: p.receiptNo,
      receiptUrl: p.receiptUrl,
      canViewReceipt: isApproved,
    };
  }

  /** Counts + totals per status, for the tabs/badges on the payments page. */
  static async summary(schoolId: string) {
    const rows: any[] = await Payment.aggregate([
      { $match: { schoolId: new mongoose.Types.ObjectId(schoolId) } },
      { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
    ]);
    const get = (...st: string[]) =>
      rows.filter((r) => st.includes(r._id)).reduce(
        (a, r) => ({ count: a.count + r.count, amount: a.amount + r.amount }),
        { count: 0, amount: 0 }
      );
    return {
      pending: get('PENDING'),
      approved: get('APPROVED', 'CONFIRMED'),
      rejected: get('REJECTED'),
      failed: get('FAILED'),
      all: get('PENDING', 'APPROVED', 'CONFIRMED', 'REJECTED', 'FAILED'),
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

  /**
   * Add an approved amount to an invoice ATOMICALLY ($inc) and recompute its status.
   * Two simultaneous approvals can no longer lose or double a payment.
   */
  static async applyToInvoice(schoolId: string, invoiceId: string, amount: number) {
    // One atomic pipeline update: amountPaid, balance and status are all recomputed
    // together. ($inc alone bypassed the pre-save hook, so `balance` went stale.)
    const updated: any = await Invoice.findOneAndUpdate(
      { _id: invoiceId, schoolId },
      [
        { $set: { amountPaid: { $add: [{ $ifNull: ['$amountPaid', 0] }, amount] } } },
        { $set: { balance: { $max: [{ $subtract: ['$total', '$amountPaid'] }, 0] } } },
        {
          $set: {
            status: {
              $switch: {
                branches: [
                  { case: { $eq: ['$status', 'CANCELLED'] }, then: 'CANCELLED' },
                  { case: { $and: [{ $gt: ['$total', 0] }, { $gte: ['$amountPaid', '$total'] }] }, then: 'PAID' },
                  { case: { $gt: ['$amountPaid', 0] }, then: 'PARTIALLY_PAID' },
                ],
                default: '$status',
              },
            },
          },
        },
      ],
      { new: true }
    );
    if (!updated) return null;
    try {
      const { syncStudentFees } = await import('../../services/financeSync.service');
      await syncStudentFees(schoolId, String(updated.studentId));
    } catch (_) {}
    return updated;
  }

  static async approve(schoolId: string, id: string, actorId: string) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid payment id');

    const existing = await Payment.findOne({ _id: id, schoolId });
    if (!existing) throw new NotFoundError('Payment not found');
    if (existing.status === 'APPROVED' || existing.status === 'CONFIRMED') {
      throw new BadRequestError('Payment is already approved');
    }
    if (existing.status === 'REJECTED') throw new BadRequestError('Cannot approve a rejected payment');
    if (existing.status === 'FAILED') throw new BadRequestError('Cannot approve a failed payment');

    // Stop an approval that would push the invoice past its total.
    if (existing.invoiceId) {
      const inv: any = await Invoice.findOne({ _id: existing.invoiceId, schoolId }).select('total amountPaid status').lean();
      if (inv) {
        if (inv.status === 'CANCELLED') throw new BadRequestError('The invoice for this payment was cancelled.');
        const remaining = (inv.total || 0) - (inv.amountPaid || 0);
        if (remaining > 0 && existing.amount > remaining) {
          throw new BadRequestError(
            `This payment (₦${(existing.amount / 100).toLocaleString('en-NG')}) is more than the invoice balance (₦${(remaining / 100).toLocaleString('en-NG')}). Reject it or ask for a corrected payment.`
          );
        }
      }
    }

    // ATOMIC CLAIM: only one request can move PENDING -> APPROVED. A double tap gets null here.
    const payment: any = await Payment.findOneAndUpdate(
      { _id: id, schoolId, status: 'PENDING' },
      {
        $set: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedBy: actorId,
          receiptNo: existing.receiptNo || `RCP-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`,
        },
      },
      { new: true }
    );
    if (!payment) throw new BadRequestError('This payment was already processed by someone else. Refresh the list.');

    if (payment.invoiceId) {
      await PaymentService.applyToInvoice(schoolId, String(payment.invoiceId), payment.amount);
    }
    void PaymentNotifier.onPaymentApplied(schoolId, String(payment._id));

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
    const existing = await Payment.findOne({ _id: id, schoolId });
    if (!existing) throw new NotFoundError('Payment not found');
    if (existing.status === 'APPROVED' || existing.status === 'CONFIRMED') {
      throw new BadRequestError('Cannot reject an approved payment');
    }
    if (existing.status === 'REJECTED') throw new BadRequestError('Payment is already rejected');

    const payment: any = await Payment.findOneAndUpdate(
      { _id: id, schoolId, status: { $in: ['PENDING', 'FAILED'] } },
      {
        $set: {
          status: 'REJECTED',
          rejectionReason: (reason && String(reason).trim()) || 'No reason provided',
          rejectedAt: new Date(),
          rejectedBy: actorId,
        },
      },
      { new: true }
    );
    if (!payment) throw new BadRequestError('This payment was already processed. Refresh the list.');

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
      await PaymentService.applyToInvoice(schoolId, String(invoice._id), amountKobo);
      if (!payment.receiptNo) {
        payment.receiptNo = `RCP-${Date.now().toString(36).toUpperCase()}`;
        await payment.save();
      }
      void PaymentNotifier.onPaymentApplied(schoolId, String(payment._id));
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
