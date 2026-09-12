import { Student } from '../../models/Student';
import { Invoice } from '../../models/Invoice';
import { Payment } from '../../models/Payment';

export class DefaultersService {
  // A "defaulter" is any active student whose outstanding balance across
  // all non-cancelled invoices exceeds zero. We compute this on the fly
  // because invoices and payments are written independently.
  static async getDefaulters(schoolId: string) {
    const students = await Student.find({ schoolId, status: 'ACTIVE' })
      .populate('classId', 'name')
      .populate('parentIds', 'firstName lastName phone email')
      .lean();

    const invoices = await Invoice.find({
      schoolId,
      status: { $in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
    }).lean();

    const payments = await Payment.find({
      schoolId,
      status: 'CONFIRMED',
    }).lean();

    // Build per-student totals.
    const perStudent = new Map<string, { expected: number; paid: number }>();
    for (const inv of invoices) {
      const sid = inv.studentId?.toString();
      if (!sid) continue;
      const row = perStudent.get(sid) || { expected: 0, paid: 0 };
      row.expected += inv.total || 0;
      perStudent.set(sid, row);
    }
    for (const p of payments) {
      const sid = p.studentId?.toString();
      if (!sid) continue;
      const row = perStudent.get(sid) || { expected: 0, paid: 0 };
      row.paid += p.amount || 0;
      perStudent.set(sid, row);
    }

    const defaulters = [];
    for (const student of students) {
      const sid = (student as any)._id.toString();
      const totals = perStudent.get(sid);
      if (!totals || totals.expected <= totals.paid) continue;

      const parent = (student as any).parentIds?.[0];
      const className = (student as any).classId?.name || '';

      defaulters.push({
        id: sid,
        fullName: `${(student as any).firstName} ${(student as any).lastName}`.trim(),
        admissionNumber: (student as any).admissionNumber,
        className,
        classId: (student as any).classId?._id,
        guardian: parent ? `${parent.firstName} ${parent.lastName}`.trim() : '',
        guardianPhone: parent?.phone || '',
        guardianEmail: parent?.email || '',
        fees: {
          expected: totals.expected,
          paid: totals.paid,
          status: totals.paid >= totals.expected ? 'PAID'
            : totals.paid > 0 ? 'PARTIAL' : 'OUTSTANDING',
        },
      });
    }

    // Sort by amount owed, highest first.
    defaulters.sort((a, b) =>
      (b.fees.expected - b.fees.paid) - (a.fees.expected - a.fees.paid)
    );

    return defaulters;
  }
}
