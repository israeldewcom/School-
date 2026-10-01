// src/core/enrollment/enrollment.service.ts
//
// "Is my school growing, and who still owes?" — per-class headcount, how many
// joined this month/term, a 12-month growth curve and outstanding fees,
// computed live from students and invoices.
import mongoose from 'mongoose';
import { Student } from '../../models/Student';
import { Class } from '../../models/Class';
import { Invoice } from '../../models/Invoice';
import { Term } from '../../models/Term';
import { School } from '../../models/School';
import { AdmissionApplication } from '../../models/AdmissionApplication';
import { UserScope } from '../../middleware/scope.middleware';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';
import { oid } from '../../utils/validate';

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export class EnrollmentService {
  static async overview(schoolId: string, scope: UserScope) {
    const sid = new mongoose.Types.ObjectId(schoolId);
    const now = new Date();
    const thisMonth = monthStart(now);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const school: any = await School.findById(schoolId).select('currentTermId').lean();
    const term: any = school?.currentTermId && mongoose.isValidObjectId(school.currentTermId)
      ? await Term.findById(school.currentTermId).select('name startDate').lean()
      : null;
    const termStart: Date | null = term?.startDate || null;

    const classFilter: any = { schoolId: sid, isActive: true };
    const studentMatch: any = { schoolId: sid, status: 'ACTIVE' };
    if (!scope.unrestricted) {
      const ids = (scope.classIds || []).map((c) => new mongoose.Types.ObjectId(c));
      classFilter._id = { $in: ids };
      studentMatch.classId = { $in: ids };
    }

    const [classes, perClass, series, invoiceRows, apps] = await Promise.all([
      Class.find(classFilter).select('name level').sort({ level: 1, name: 1 }).lean(),
      Student.aggregate([
        { $match: studentMatch },
        {
          $group: {
            _id: '$classId',
            total: { $sum: 1 },
            newThisMonth: { $sum: { $cond: [{ $gte: ['$createdAt', thisMonth] }, 1, 0] } },
            newLastMonth: { $sum: { $cond: [{ $and: [{ $gte: ['$createdAt', lastMonth] }, { $lt: ['$createdAt', thisMonth] }] }, 1, 0] } },
            newThisTerm: termStart ? { $sum: { $cond: [{ $gte: ['$createdAt', termStart] }, 1, 0] } } : { $sum: 0 },
          },
        },
      ]),
      Student.aggregate([
        { $match: { ...studentMatch, createdAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) } } },
        { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, count: { $sum: 1 } } },
      ]),
      Invoice.aggregate([
        { $match: { schoolId: sid, status: { $nin: ['CANCELLED', 'DRAFT'] }, ...(studentMatch.classId ? { classId: studentMatch.classId } : {}) } },
        {
          $group: {
            _id: '$classId',
            expected: { $sum: '$total' },
            paid: { $sum: '$amountPaid' },
            invoices: { $sum: 1 },
            fullyPaid: { $sum: { $cond: [{ $gte: ['$amountPaid', '$total'] }, 1, 0] } },
            partlyPaid: { $sum: { $cond: [{ $and: [{ $gt: ['$amountPaid', 0] }, { $lt: ['$amountPaid', '$total'] }] }, 1, 0] } },
          },
        },
      ]),
      scope.unrestricted
        ? AdmissionApplication.aggregate([{ $match: { schoolId: sid } }, { $group: { _id: '$status', c: { $sum: 1 } } }])
        : Promise.resolve([] as any[]),
    ]);

    const countBy = new Map<string, any>(perClass.map((r: any) => [String(r._id), r]));
    const feeBy = new Map<string, any>(invoiceRows.map((r: any) => [String(r._id), r]));

    const rows = classes.map((c: any) => {
      const n = countBy.get(String(c._id)) || { total: 0, newThisMonth: 0, newLastMonth: 0, newThisTerm: 0 };
      const f = feeBy.get(String(c._id)) || { expected: 0, paid: 0, invoices: 0, fullyPaid: 0, partlyPaid: 0 };
      const before = n.total - n.newThisMonth;
      return {
        classId: String(c._id),
        className: c.name,
        students: n.total,
        newThisMonth: n.newThisMonth,
        newLastMonth: n.newLastMonth,
        newThisTerm: n.newThisTerm,
        growthPercentThisMonth: before > 0 ? Math.round((n.newThisMonth / before) * 1000) / 10 : n.newThisMonth > 0 ? 100 : 0,
        fees: {
          expected: f.expected,
          paid: f.paid,
          outstanding: Math.max(f.expected - f.paid, 0),
          fullyPaid: f.fullyPaid,
          partlyPaid: f.partlyPaid,
          unpaid: Math.max(f.invoices - f.fullyPaid - f.partlyPaid, 0),
        },
      };
    });

    // 12-month growth curve (running total ends at today's headcount).
    const total = rows.reduce((a, r) => a + r.students, 0);
    const byMonth = new Map(series.map((r: any) => [`${r._id.y}-${r._id.m}`, r.count]));
    const months: Array<{ month: string; joined: number; total: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, joined: byMonth.get(`${d.getFullYear()}-${d.getMonth() + 1}`) || 0, total: 0 });
    }
    let running = total - months.reduce((a, m) => a + m.joined, 0);
    for (const m of months) { running += m.joined; m.total = running; }

    const totals = rows.reduce(
      (a, r) => ({
        students: a.students + r.students,
        newThisMonth: a.newThisMonth + r.newThisMonth,
        newThisTerm: a.newThisTerm + r.newThisTerm,
        expected: a.expected + r.fees.expected,
        paid: a.paid + r.fees.paid,
        outstanding: a.outstanding + r.fees.outstanding,
      }),
      { students: 0, newThisMonth: 0, newThisTerm: 0, expected: 0, paid: 0, outstanding: 0 }
    );

    const appStatus: Record<string, number> = {};
    for (const a of apps) appStatus[a._id] = a.c;

    return {
      term: term ? { id: String(term._id), name: term.name, startDate: term.startDate } : null,
      totals,
      classes: rows,
      monthly: months,
      applications: scope.unrestricted
        ? { pendingReview: (appStatus.SUBMITTED || 0) + (appStatus.UNDER_REVIEW || 0), enrolled: appStatus.ENROLLED || 0, byStatus: appStatus }
        : undefined,
    };
  }

  /** One class: who joined recently and who still owes. */
  static async classDetail(schoolId: string, scope: UserScope, classId: string) {
    oid(classId, 'classId');
    if (!scope.unrestricted && !(scope.classIds || []).includes(String(classId))) {
      throw new BadRequestError('That class is not in your scope.');
    }
    const cls: any = await Class.findOne({ _id: classId, schoolId }).select('name').lean();
    if (!cls) throw new NotFoundError('Class not found');

    const students: any[] = await Student.find({ schoolId, classId, status: 'ACTIVE' })
      .select('firstName lastName fullName admissionNumber createdAt photo')
      .sort({ createdAt: -1 })
      .lean();
    const invoices: any[] = await Invoice.find({
      schoolId, classId, status: { $nin: ['CANCELLED', 'DRAFT'] }, studentId: { $in: students.map((s) => s._id) },
    }).select('studentId total amountPaid').lean();
    const feeBy = new Map<string, { expected: number; paid: number }>();
    for (const i of invoices) {
      const k = String(i.studentId);
      const cur = feeBy.get(k) || { expected: 0, paid: 0 };
      cur.expected += i.total || 0;
      cur.paid += i.amountPaid || 0;
      feeBy.set(k, cur);
    }
    const monthAgo = new Date(Date.now() - 30 * 86400000);
    return {
      classId,
      className: cls.name,
      total: students.length,
      students: students.map((s) => {
        const f = feeBy.get(String(s._id)) || { expected: 0, paid: 0 };
        const outstanding = Math.max(f.expected - f.paid, 0);
        return {
          id: String(s._id),
          name: s.fullName || `${s.firstName} ${s.lastName}`.trim(),
          admissionNumber: s.admissionNumber,
          photo: s.photo || null,
          joinedAt: s.createdAt,
          isNew: new Date(s.createdAt) >= monthAgo,
          feeStatus: f.expected === 0 ? 'NO_INVOICE' : outstanding === 0 ? 'PAID' : f.paid > 0 ? 'PARTIAL' : 'UNPAID',
          expected: f.expected,
          paid: f.paid,
          outstanding,
        };
      }),
    };
  }
}
