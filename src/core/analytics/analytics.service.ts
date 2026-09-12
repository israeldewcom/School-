import { Student } from '../../models/Student';
import { Payment } from '../../models/Payment';
import { Invoice } from '../../models/Invoice';
import { Attendance } from '../../models/Attendance';
import { Class } from '../../models/Class';

export class AnalyticsService {
  static async getSchoolStats(schoolId: string) {
    const totalStudents = await Student.countDocuments({ schoolId, status: 'ACTIVE' });
    const totalInvoices = await Invoice.countDocuments({ schoolId });
    const totalPayments = await Payment.countDocuments({ schoolId, status: 'CONFIRMED' });
    const totalRevenue = await Payment.aggregate([
      { $match: { schoolId, status: 'CONFIRMED' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const attendanceRate = await Attendance.aggregate([
      { $match: { schoolId } },
      {
        $group: {
          _id: null,
          present: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } },
          total: { $sum: 1 },
        },
      },
      { $project: { rate: { $multiply: [{ $divide: ['$present', '$total'] }, 100] } } },
    ]);
    return {
      totalStudents,
      totalInvoices,
      totalPayments,
      totalRevenue: totalRevenue[0]?.total || 0,
      attendanceRate: attendanceRate[0]?.rate || 0,
    };
  }

  // ------------------------------------------------------------------
  // Daily fee collection over the last N days. Feeds the "Collected"
  // line chart on the dashboard.
  // ------------------------------------------------------------------
  static async getDailyCollection(schoolId: string, days: number) {
    const clampedDays = Math.min(Math.max(days || 14, 1), 90);
    const start = new Date();
    start.setDate(start.getDate() - (clampedDays - 1));
    start.setHours(0, 0, 0, 0);

    const results = await Payment.aggregate([
      {
        $match: {
          schoolId,
          status: 'CONFIRMED',
          confirmedAt: { $gte: start },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$confirmedAt' },
            month: { $month: '$confirmedAt' },
            day: { $dayOfMonth: '$confirmedAt' },
          },
          total: { $sum: '$amount' },
        },
      },
    ]);

    const byKey = new Map<string, number>();
    for (const r of results) {
      byKey.set(`${r._id.year}-${r._id.month}-${r._id.day}`, r.total);
    }

    const labels: string[] = [];
    const values: number[] = [];
    const cursor = new Date(start);
    for (let i = 0; i < clampedDays; i++) {
      const key = `${cursor.getFullYear()}-${cursor.getMonth() + 1}-${cursor.getDate()}`;
      labels.push(cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      values.push(byKey.get(key) || 0);
      cursor.setDate(cursor.getDate() + 1);
    }

    return { labels, values };
  }

  // ------------------------------------------------------------------
  // Confirmed payment totals grouped by payment method. Feeds the
  // "payment methods" doughnut chart.
  // ------------------------------------------------------------------
  static async getPaymentMethodBreakdown(schoolId: string) {
    const results = await Payment.aggregate([
      { $match: { schoolId, status: 'CONFIRMED' } },
      { $group: { _id: '$method', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
    ]);

    return {
      labels: results.map((r) => r._id),
      values: results.map((r) => r.total),
    };
  }

  // ------------------------------------------------------------------
  // Expected vs. collected fees per class. Feeds the class-collection
  // bar chart (dashboard + reports page).
  // ------------------------------------------------------------------
  static async getClassCollection(schoolId: string) {
    const classes = await Class.find({ schoolId, isActive: true }).select('name').lean();
    if (classes.length === 0) return { labels: [], expected: [], collected: [] };

    const classIds = classes.map((c) => c._id);

    const [studentsByClass, invoicesByStudent] = await Promise.all([
      Student.aggregate([
        { $match: { schoolId, status: 'ACTIVE', classId: { $in: classIds } } },
        { $project: { _id: 1, classId: 1 } },
      ]),
      Invoice.find({ schoolId }).select('studentId total amountPaid').lean(),
    ]);

    const classByStudent = new Map<string, string>();
    for (const s of studentsByClass) {
      classByStudent.set(s._id.toString(), s.classId.toString());
    }

    const expectedByClass = new Map<string, number>();
    const collectedByClass = new Map<string, number>();
    for (const inv of invoicesByStudent) {
      const classId = classByStudent.get(inv.studentId?.toString());
      if (!classId) continue;
      expectedByClass.set(classId, (expectedByClass.get(classId) || 0) + (inv.total || 0));
      collectedByClass.set(classId, (collectedByClass.get(classId) || 0) + (inv.amountPaid || 0));
    }

    return {
      labels: classes.map((c) => c.name),
      expected: classes.map((c) => expectedByClass.get(c._id.toString()) || 0),
      collected: classes.map((c) => collectedByClass.get(c._id.toString()) || 0),
    };
  }

  // ------------------------------------------------------------------
  // Active student count per class. Feeds the class-distribution chart.
  // ------------------------------------------------------------------
  static async getClassDistribution(schoolId: string) {
    const classes = await Class.find({ schoolId, isActive: true }).select('name').lean();
    if (classes.length === 0) return { labels: [], values: [] };

    const counts = await Student.aggregate([
      { $match: { schoolId, status: 'ACTIVE' } },
      { $group: { _id: '$classId', count: { $sum: 1 } } },
    ]);

    const countByClass = new Map<string, number>();
    for (const c of counts) {
      countByClass.set(c._id?.toString(), c.count);
    }

    return {
      labels: classes.map((c) => c.name),
      values: classes.map((c) => countByClass.get(c._id.toString()) || 0),
    };
  }
}
