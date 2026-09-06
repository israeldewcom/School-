import { LedgerEntry } from '../../models/LedgerEntry';

export class LedgerService {
  static async getStudentLedger(studentId: string, schoolId: string) {
    return LedgerEntry.find({ studentId, schoolId }).sort({ createdAt: -1 });
  }

  static async getInvoiceLedger(invoiceId: string, schoolId: string) {
    return LedgerEntry.find({ invoiceId, schoolId }).sort({ createdAt: -1 });
  }

  static async getSchoolLedger(schoolId: string, filter: any) {
    return LedgerEntry.find({ schoolId, ...filter }).sort({ createdAt: -1 });
  }
}
