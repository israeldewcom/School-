// src/core/analytics/analytics.service.ts
import { Student } from '../../models/Student';
import { Payment } from '../../models/Payment';
import { Invoice } from '../../models/Invoice';
import { Attendance } from '../../models/Attendance';
import { Class } from '../../models/Class';
import { Staff } from '../../models/Staff';

export class AnalyticsService {
  /**
   * Top-level dashboard stats. Every sub-query is independently
   * guarded so a single failing collection can't blank the whole page.
   * On any failure, that metric returns 0 rather than throwing.
   */
  static async getSchoolStats(schoolId: string) {
    const [
      totalStudents,
      totalInvoices,
      totalPayments,
      revenueAgg,
      attendanceAgg,
      totalClasses,
      totalStaff,
    ] = await Promise.all([
      Student.countDocuments({ schoolId, status: 'ACTIVE' }).catch(() => 0),
      Invoice.countDocuments({ schoolId }).catch(() => 0),
      Payment.countDocuments({ schoolId }).catch(() => 0),
      Payment.aggregate([
        { $match: { schoolId, status: { $in: ['CONFIRMED', 'APPROVED'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).catch(() => []),
      Attendance.aggregate([
        { $match: { schoolId } },
        {
          $group: {
            _id: null,
            present: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } },
            total: { $sum: 1 },
          },
        },
      ]).catch(() => []),
      Class.countDocuments({ schoolId }).catch(() => 0),
      Staff.countDocuments({ schoolId }).catch(() => 0),
    ]);

    const totalCollected = revenueAgg?.[0]?.total || 0;
    const attendanceRate = attendanceAgg?.[0]?.total > 0
      ? Math.round((attendanceAgg[0].present / attendanceAgg[0].total) * 100)
      : 0;

    // Total expected = sum of invoices across the school.
    let totalExpected = 0;
    try {
      const expectedAgg = await Invoice.aggregate([
        { $match: { schoolId } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]);
      totalExpected = expectedAgg?.[0]?.total || 0;
    } catch (_) {}

    const totalOutstanding = Math.max(totalExpected - totalCollected, 0);
    const collectionRate = totalExpected > 0
      ? Math.round((totalCollected / totalExpected) * 100)
      : 0;

    return {
      schoolId,
      totalStudents,
      totalInvoices,
      totalPayments,
      totalClasses,
      totalStaff,
      totalCollected,
      totalRevenue: totalCollected,
      totalExpected,
      totalOutstanding,
      collectionRate,
      avgAttendance: attendanceRate,
      attendanceRate,
      defaultersCount: 0,
      newStudentsThisTerm: 0,
    };
  }

  static async getDailyCollection(schoolId: string, days: number) {
    const clampedDays = Math.min(Math.max(days || 14, 1), 90);
    const start = new Date();
    start.setDate(start.getDate() - (clampedDays - 1));
    start.setHours(0, 0, 0, 0);

    let results: any[] = [];
    try {
      results = await Payment.aggregate([
        {
          $match: {
            schoolId,
            status: { $in: ['CONFIRMED', 'APPROVED'] },
            $or: [
              { confirmedAt: { $gte: start } },
              { createdAt: { $gte: start } },
            ],
          },
        },
        {
          $group: {
            _id: {
              year: { $year: { $ifNull: ['$confirmedAt', '$createdAt'] } },
              month: { $month: { $ifNull: ['$confirmedAt', '$createdAt'] } },
              day: { $dayOfMonth: { $ifNull: ['$confirmedAt', '$createdAt'] } },
            },
            total: { $sum: '$amount' },
          },
        },
      ]);
    } catch (_) {}

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

  static async getPaymentMethodBreakdown(schoolId: string) {
    let results: any[] = [];
    try {
      results = await Payment.aggregate([
        { $match: { schoolId, status: { $in: ['CONFIRMED', 'APPROVED'] } } },
        { $group: { _id: '$method', total: { $sum: '$amount' } } },
        { $sort: { total: -1 } },
      ]);
    } catch (_) {}

    return {
      labels: results.map((r) => r._id || 'Unknown'),
      values: results.map((r) => r.total || 0),
    };
  }

  static async getClassCollection(schoolId: string) {
    try {
      const classes = await Class.find({ schoolId, isActive: true }).select('name').lean();
      if (classes.length === 0) return { labels: [], expected: [], collected: [] };

      const classIds = classes.map((c) => c._id);

      const [studentsByClass, invoices] = await Promise.all([
        Student.aggregate([
          { $match: { schoolId, status: 'ACTIVE', classId: { $in: classIds } } },
          { $project: { _id: 1, classId: 1 } },
        ]).catch(() => []),
        Invoice.find({ schoolId }).select('studentId total amountPaid').lean().catch(() => []),
      ]);

      const classByStudent = new Map<string, string>();
      for (const s of studentsByClass) {
        if (s.classId) classByStudent.set(String(s._id), String(s.classId));
      }

      const expectedByClass = new Map<string, number>();
      const collectedByClass = new Map<string, number>();
      for (const inv of invoices) {
        const classId = classByStudent.get(String(inv.studentId));
        if (!classId) continue;
        expectedByClass.set(classId, (expectedByClass.get(classId) || 0) + (inv.total || 0));
        collectedByClass.set(classId, (collectedByClass.get(classId) || 0) + (inv.amountPaid || 0));
      }

      return {
        labels: classes.map((c) => c.name),
        expected: classes.map((c) => expectedByClass.get(String(c._id)) || 0),
        collected: classes.map((c) => collectedByClass.get(String(c._id)) || 0),
      };
    } catch (_) {
      return { labels: [], expected: [], collected: [] };
    }
  }

  static async getClassDistribution(schoolId: string) {
    try {
      const classes = await Class.find({ schoolId, isActive: true }).select('name').lean();
      if (classes.length === 0) return { labels: [], values: [] };

      const counts = await Student.aggregate([
        { $match: { schoolId, status: 'ACTIVE' } },
        { $group: { _id: '$classId', count: { $sum: 1 } } },
      ]).catch(() => []);

      const countByClass = new Map<string, number>();
      for (const c of counts) {
        if (c._id) countByClass.set(String(c._id), c.count);
      }

      return {
        labels: classes.map((c) => c.name),
        values: classes.map((c) => countByClass.get(String(c._id)) || 0),
      };
    } catch (_) {
      return { labels: [], values: [] };
    }
  }

  static async getWeeklySummary(schoolId: string) {
    // Weekly rollup used by the dashboard's Monday summary card.
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    const prevStart = new Date(weekStart);
    prevStart.setDate(prevStart.getDate() - 7);

    const collectedRange = async (from: Date, to: Date) => {
      try {
        const agg = await Payment.aggregate([
          {
            $match: {
              schoolId,
              status: { $in: ['CONFIRMED', 'APPROVED'] },
              $or: [
                { confirmedAt: { $gte: from, $lte: to } },
                { createdAt: { $gte: from, $lte: to } },
              ],
            },
          },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);
        return agg?.[0]?.total || 0;
      } catch (_) { return 0; }
    };

    const [thisWeek, lastWeek] = await Promise.all([
      collectedRange(weekStart, now),
      collectedRange(prevStart, weekStart),
    ]);

    const countRange = async (from: Date, to: Date) => {
      try {
        return await Payment.countDocuments({
          schoolId,
          status: { $in: ['CONFIRMED', 'APPROVED'] },
          createdAt: { $gte: from, $lte: to },
        });
      } catch (_) { return 0; }
    };

    const [thisWeekCount, lastWeekCount] = await Promise.all([
      countRange(weekStart, now),
      countRange(prevStart, weekStart),
    ]);

    let attendanceRate = 0, lastWeekAttendance = 0;
    try {
      const att = await Attendance.aggregate([
        { $match: { schoolId, date: { $gte: weekStart, $lte: now } } },
        {
          $group: {
            _id: null,
            present: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } },
            total: { $sum: 1 },
          },
        },
      ]);
      attendanceRate = att?.[0]?.total > 0
        ? Math.round((att[0].present / att[0].total) * 100)
        : 0;
    } catch (_) {}

    try {
      const att = await Attendance.aggregate([
        { $match: { schoolId, date: { $gte: prevStart, $lt: weekStart } } },
        {
          $group: {
            _id: null,
            present: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } },
            total: { $sum: 1 },
          },
        },
      ]);
      lastWeekAttendance = att?.[0]?.total > 0
        ? Math.round((att[0].present / att[0].total) * 100)
        : 0;
    } catch (_) {}

    return {
      collectedThisWeek: thisWeek,
      collectedLastWeek: lastWeek,
      paymentsApproved: thisWeekCount,
      paymentsApprovedLastWeek: lastWeekCount,
      attendanceRate,
      attendanceRateLastWeek: lastWeekAttendance,
      defaultersCount: 0,
      defaultersCountLastWeek: 0,
    };
  }
}
