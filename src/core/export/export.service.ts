import { Student } from '../../models/Student';
import { Invoice } from '../../models/Invoice';
import { Payment } from '../../models/Payment';
import { Parser } from 'json2csv';
import { NotFoundError } from '../../utils/errors';

export class ExportService {
  static async exportStudents(schoolId: string) {
    const students = await Student.find({ schoolId }).lean();
    const parser = new Parser({ fields: ['firstName', 'lastName', 'admissionNumber', 'classId', 'status'] });
    return parser.parse(students);
  }

  static async exportInvoices(schoolId: string) {
    const invoices = await Invoice.find({ schoolId }).lean();
    const parser = new Parser({ fields: ['invoiceNumber', 'studentId', 'total', 'balance', 'status'] });
    return parser.parse(invoices);
  }

  static async exportPayments(schoolId: string) {
    const payments = await Payment.find({ schoolId }).lean();
    const parser = new Parser({ fields: ['reference', 'amount', 'method', 'status', 'createdAt'] });
    return parser.parse(payments);
  }
}
