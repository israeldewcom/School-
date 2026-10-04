// src/core/payments/receipt.service.ts
import mongoose from 'mongoose';
import { Payment } from '../../models/Payment';
import { Invoice } from '../../models/Invoice';
import { School } from '../../models/School';
import { User } from '../../models/User';
import { ReportCardTemplate } from '../../models/ReportCardTemplate';
import { ReportCardRendererService } from '../reportCards/reportCardRenderer.service';
import { renderReceiptPDF } from '../../utils/pdfGenerator';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';
import { logoPngBuffer } from '../branding/logo.service';

export function numberToWords(kobo: number): string {
  const naira = Math.floor((kobo || 0) / 100);
  if (naira === 0) return 'Zero naira';
  const units = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  const three = (n: number): string => {
    let out = '';
    if (n >= 100) {
      out += units[Math.floor(n / 100)] + ' hundred';
      n %= 100;
      if (n > 0) out += ' and ';
    }
    if (n >= 20) {
      out += tens[Math.floor(n / 10)];
      if (n % 10 > 0) out += '-' + units[n % 10];
    } else if (n >= 10) out += teens[n - 10];
    else if (n > 0) out += units[n];
    return out;
  };

  const parts: string[] = [];
  const billion = Math.floor(naira / 1_000_000_000);
  const million = Math.floor((naira % 1_000_000_000) / 1_000_000);
  const thousand = Math.floor((naira % 1_000_000) / 1000);
  const rest = naira % 1000;
  if (billion) parts.push(three(billion) + ' billion');
  if (million) parts.push(three(million) + ' million');
  if (thousand) parts.push(three(thousand) + ' thousand');
  if (rest) parts.push(three(rest));
  const words = parts.join(' ').trim() || 'zero';
  return words.charAt(0).toUpperCase() + words.slice(1) + ' naira';
}

export class ReceiptService {
  /**
   * Render a receipt PDF. Uses the school's uploaded receipt template when one
   * exists (explicit templateId, else the active/default one); otherwise falls
   * back to the built-in layout, so receipts always work.
   *
   * `studentIds` (optional) restricts access — used by the parent portal so a
   * parent can only open receipts for their own children.
   */
  static async render(
    schoolId: string,
    paymentId: string,
    opts: { templateId?: string; studentIds?: string[] } = {}
  ): Promise<{ pdf: Buffer; filename: string }> {
    if (!mongoose.isValidObjectId(paymentId)) throw new BadRequestError('Invalid payment id');

    const payment: any = await Payment.findOne({ _id: paymentId, schoolId })
      .populate('studentId', 'fullName firstName lastName admissionNumber classId')
      .lean();
    if (!payment) throw new NotFoundError('Payment not found');
    if (!['APPROVED', 'CONFIRMED'].includes(payment.status)) {
      throw new BadRequestError('A receipt is only available for approved payments.');
    }

    const student = payment.studentId || {};
    const studentKey = String(student._id || payment.studentId);
    if (opts.studentIds && !opts.studentIds.includes(studentKey)) {
      throw new NotFoundError('Payment not found');
    }

    const [invoice, school, approver, cls]: any[] = await Promise.all([
      payment.invoiceId ? Invoice.findOne({ _id: payment.invoiceId, schoolId }).lean() : null,
      School.findById(schoolId).select('name address phone logo').lean(),
      payment.approvedBy && mongoose.isValidObjectId(String(payment.approvedBy))
        ? User.findById(payment.approvedBy).select('name firstName lastName').lean()
        : null,
      student.classId ? mongoose.model('Class').findById(student.classId).select('name').lean() : null,
    ]);

    const studentName =
      student.fullName || `${student.firstName || ''} ${student.lastName || ''}`.trim() || '—';
    const total = invoice?.total ?? payment.amount;
    const paidToDate = invoice?.amountPaid ?? payment.amount;
    const balance = invoice ? Math.max((invoice.total || 0) - (invoice.amountPaid || 0), 0) : 0;
    const status = invoice && balance > 0 ? 'PARTIALLY PAID' : 'FULLY PAID';
    const date = payment.approvedAt || payment.confirmedAt || payment.createdAt;
    const receiptNo = payment.receiptNo || String(paymentId).slice(-8).toUpperCase();
    const cashier = approver ? approver.name || `${approver.firstName || ''} ${approver.lastName || ''}`.trim() : '';

    let template: any = null;
    if (opts.templateId && mongoose.isValidObjectId(opts.templateId)) {
      template = await ReportCardTemplate.findOne({ _id: opts.templateId, schoolId, type: 'receipt' });
    } else {
      template = await ReportCardTemplate.findOne({ schoolId, type: 'receipt', isActive: true }).sort({
        isDefault: -1,
        createdAt: -1,
      });
    }

    const filename = `receipt-${receiptNo}.pdf`;

    if (template) {
      const pdf = await ReportCardRendererService.renderReceipt(schoolId, String(template._id), {
        receiptNo,
        date: new Date(date).toLocaleDateString('en-NG'),
        studentName,
        amount: payment.amount || 0,
        amountInWords: numberToWords(payment.amount || 0),
        method: String(payment.method || '—').replace(/_/g, ' '),
        reference: payment.reference || '—',
        schoolName: school?.name || 'School',
        cashierName: cashier || undefined,
        admissionNumber: student.admissionNumber || '',
        className: cls?.name || '',
        invoiceTotal: total,
        amountPaidToDate: paidToDate,
        balance,
        paymentStatus: status,
      });
      return { pdf, filename };
    }

    const pdf = await renderReceiptPDF({
      school: {
        name: school?.name || 'School',
        address: school?.address,
        phone: school?.phone,
        logoPng: (await logoPngBuffer(school?.logo)) || undefined,
      },
      status,
      receiptNo,
      cashierName: cashier || undefined,
      amountInWords: numberToWords(payment.amount || 0),
      payment: {
        reference: payment.reference,
        amount: payment.amount,
        method: String(payment.method || '').replace(/_/g, ' '),
        confirmedAt: new Date(date),
      },
      invoice: {
        invoiceNumber: invoice?.invoiceNumber || '—',
        total,
        amountPaid: paidToDate,
        balance,
      },
      student: { name: studentName, admissionNumber: student.admissionNumber || '', className: cls?.name || '' },
    });
    return { pdf, filename };
  }
}
