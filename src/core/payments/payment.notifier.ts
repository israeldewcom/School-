// src/core/payments/payment.notifier.ts
import { Payment } from '../../models/Payment';
import { Invoice } from '../../models/Invoice';
import { Student } from '../../models/Student';
import { School } from '../../models/School';
import { Notifier } from '../../services/notifier.service';
import { syncStudentFees } from '../../services/financeSync.service';
import { naira } from '../../utils/phone';
import logger from '../../config/logger';

export class PaymentNotifier {
  /**
   * Call after a payment has been applied to an invoice. Re-syncs the student's
   * fee totals and tells the family whether the fees are now partly or fully
   * paid. Never throws — a notification problem must not undo a payment.
   */
  static async onPaymentApplied(schoolId: string, paymentId: string): Promise<void> {
    try {
      const payment: any = await Payment.findOne({ _id: paymentId, schoolId }).lean();
      if (!payment) return;

      const [invoice, student, school]: any[] = await Promise.all([
        payment.invoiceId ? Invoice.findOne({ _id: payment.invoiceId, schoolId }).lean() : null,
        Student.findOne({ _id: payment.studentId, schoolId }).select('firstName lastName fullName').lean(),
        School.findById(schoolId).select('name').lean(),
      ]);
      if (!student) return;

      await syncStudentFees(schoolId, String(payment.studentId));

      const name = student.fullName || `${student.firstName || ''} ${student.lastName || ''}`.trim();
      const schoolName = school?.name || 'School';
      const receipt = payment.receiptNo ? ` Receipt: ${payment.receiptNo}.` : '';

      let status = 'PARTIALLY PAID';
      let body: string;
      let sms: string;

      if (invoice && invoice.total > 0 && (invoice.balance ?? Math.max(invoice.total - invoice.amountPaid, 0)) <= 0) {
        status = 'FULLY PAID';
        body = `We received ${naira(payment.amount)} for ${name}. School fees are now FULLY PAID. Thank you.${receipt}`;
        sms = `${schoolName}: ${naira(payment.amount)} received for ${name}. Fees FULLY PAID. Thank you.${receipt}`;
      } else if (invoice) {
        const balance = invoice.balance ?? Math.max(invoice.total - invoice.amountPaid, 0);
        body = `We received ${naira(payment.amount)} for ${name}. Fees are PARTIALLY PAID: ${naira(invoice.amountPaid)} of ${naira(invoice.total)} paid, balance ${naira(balance)}.${receipt}`;
        sms = `${schoolName}: ${naira(payment.amount)} received for ${name}. Paid ${naira(invoice.amountPaid)} of ${naira(invoice.total)}. Balance ${naira(balance)}.${receipt}`;
      } else {
        body = `We received ${naira(payment.amount)} for ${name}.${receipt}`;
        sms = `${schoolName}: ${naira(payment.amount)} received for ${name}.${receipt}`;
      }

      await Notifier.families(schoolId, [payment.studentId], {
        title: status === 'FULLY PAID' ? 'Fees fully paid' : 'Payment received',
        body,
        sms,
        smsSetting: 'smsOnPayment',
        metadata: { kind: 'PAYMENT', paymentId: String(payment._id), status },
      });
    } catch (err: any) {
      logger.warn(`PaymentNotifier failed for ${paymentId}: ${err?.message}`);
    }
  }

  /** A bursar submitted a payment that the proprietor still has to approve. */
  static async onPendingApproval(schoolId: string, paymentId: string): Promise<void> {
    try {
      const payment: any = await Payment.findOne({ _id: paymentId, schoolId })
        .populate('studentId', 'firstName lastName fullName')
        .lean();
      if (!payment) return;
      const s = payment.studentId || {};
      const name = s.fullName || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'a student';
      await Notifier.admins(
        schoolId,
        'Payment awaiting approval',
        `${naira(payment.amount)} for ${name} needs approval.`,
        { kind: 'PAYMENT_PENDING', paymentId: String(payment._id) }
      );
    } catch (_) {}
  }
}
