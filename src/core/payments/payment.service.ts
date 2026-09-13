import mongoose from 'mongoose';
import { Payment } from '../../models/Payment';
import { Invoice } from '../../models/Invoice';
import { Student } from '../../models/Student';
import { AuditLog } from '../../models/AuditLog';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';

// Enum of allowed method values. Extend as your provider list grows.
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
  // Coerce "bank_transfer" style too.
  const upper = str.toUpperCase().replace(/\s+/g, '_');
  if (ALLOWED_METHODS.includes(upper)) return upper;
  return 'OTHER';
}

export class PaymentService {
  // ------------------------------------------------------------------
  // Manual payment (the path the frontend uses). Was returning 500 on
  // invalid input; now returns 400 with a specific field message.
  // ------------------------------------------------------------------
  static async recordManual(schoolId: string, submittedBy: string, data: any) {
    // Validate BEFORE touching the database. Every one of these would
    // previously produce a CastError → 500.
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

    // Return a shape the frontend can render without a second request.
    const populated = await Payment.findById(payment._id)
      .populate('studentId', 'fullName className')
      .populate('invoiceId', 'invoiceNumber total amountPaid');
    return populated;
  }

  // ------------------------------------------------------------------
  // List payments scoped to the school.
  // ------------------------------------------------------------------
  static async list(schoolId: string, query: any = {}) {
    const filter: any = { schoolId };
    if (query.status && ['PENDING', 'APPROVED', 'REJECTED'].includes(String(query.status).toUpperCase())) {
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

    // Flatten student fields so the frontend doesn't have to dig.
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
    if (payment.status === 'APPROVED') throw new BadRequestError('Payment is already approved');
    if (payment.status === 'REJECTED') throw new BadRequestError('Cannot approve a rejected payment');

    payment.status = 'APPROVED';
    payment.approvedAt = new Date();
    payment.approvedBy = actorId as any;
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
    if (payment.status === 'APPROVED') throw new BadRequestError('Cannot reject an approved payment');

    payment.status = 'REJECTED';
    payment.rejectionReason = reason || 'No reason provided';
    payment.rejectedAt = new Date();
    payment.rejectedBy = actorId as any;
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
}
