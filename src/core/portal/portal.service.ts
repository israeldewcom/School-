// src/core/portal/portal.service.ts
import mongoose from 'mongoose';
import { Student } from '../../models/Student';
import { Result } from '../../models/Result';
import { Attendance } from '../../models/Attendance';
import { Invoice } from '../../models/Invoice';
import { Payment } from '../../models/Payment';
import { ReportCard } from '../../models/ReportCard';
import '../../models/Class';
import '../../models/Subject';
import '../../models/Term';
import '../../models/Session';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { UserScope } from '../../middleware/scope.middleware';

function forbidden(message: string): Error {
  const err: any = new Error(message);
  err.statusCode = 403;
  err.name = 'ForbiddenError';
  return err;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function optionalId(value: any, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (!mongoose.isValidObjectId(String(value))) {
    throw new BadRequestError(`${label} is invalid`);
  }
  return String(value);
}

function requireFinance(scope: UserScope) {
  if (scope.role !== 'PARENT') {
    throw forbidden('Fee information is only available to parent accounts.');
  }
}

async function loadOwnStudent(scope: UserScope, studentId: string) {
  if (!mongoose.isValidObjectId(studentId)) {
    throw new BadRequestError('Invalid student id');
  }
  if (!(scope.ownStudentIds || []).includes(String(studentId))) {
    throw forbidden('You do not have access to this student.');
  }
  const student = await Student.findOne({
    _id: studentId,
    schoolId: scope.schoolId,
    status: { $ne: 'DELETED' },
  })
    .populate('classId', 'name')
    .lean();
  if (!student) throw new NotFoundError('Student not found');
  return student as any;
}

function serializeStudent(s: any, includePhoto = false) {
  return {
    id: String(s._id),
    firstName: s.firstName,
    lastName: s.lastName,
    fullName: s.fullName || `${s.firstName || ''} ${s.lastName || ''}`.trim(),
    admissionNumber: s.admissionNumber,
    gender: s.gender || null,
    status: s.status,
    classId: s.classId?._id ? String(s.classId._id) : s.classId ? String(s.classId) : null,
    className: s.classId?.name || null,
    ...(includePhoto ? { photo: s.photo || null, dateOfBirth: s.dateOfBirth || null } : {}),
  };
}

function buildAttendanceMatch(scope: UserScope, studentId: string, query: any = {}) {
  const match: any = {
    schoolId: new mongoose.Types.ObjectId(scope.schoolId),
    studentId: new mongoose.Types.ObjectId(studentId),
  };

  const termId = optionalId(query.termId, 'termId');
  if (termId) match.termId = new mongoose.Types.ObjectId(termId);

  const sessionId = optionalId(query.sessionId, 'sessionId');
  if (sessionId) match.sessionId = new mongoose.Types.ObjectId(sessionId);

  if (query.from || query.to) {
    match.date = {};
    if (query.from) {
      const from = new Date(String(query.from));
      if (isNaN(from.getTime())) throw new BadRequestError('from date is invalid');
      match.date.$gte = from;
    }
    if (query.to) {
      const to = new Date(String(query.to));
      if (isNaN(to.getTime())) throw new BadRequestError('to date is invalid');
      match.date.$lte = to;
    }
  }
  return match;
}

async function attendanceSummary(match: any) {
  const rows = await Attendance.aggregate([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const counts: Record<string, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
  for (const r of rows) counts[r._id] = r.count;
  const total = counts.PRESENT + counts.ABSENT + counts.LATE + counts.EXCUSED;
  return {
    present: counts.PRESENT,
    absent: counts.ABSENT,
    late: counts.LATE,
    excused: counts.EXCUSED,
    total,
    percentage: total ? round1(((counts.PRESENT + counts.LATE) / total) * 100) : 0,
  };
}

async function financeTotals(scope: UserScope, studentId: string) {
  const rows = await Invoice.aggregate([
    {
      $match: {
        schoolId: new mongoose.Types.ObjectId(scope.schoolId),
        studentId: new mongoose.Types.ObjectId(studentId),
        status: { $ne: 'CANCELLED' },
      },
    },
    {
      $group: {
        _id: null,
        totalBilled: { $sum: '$total' },
        totalPaid: { $sum: '$amountPaid' },
        balance: { $sum: '$balance' },
        invoices: { $sum: 1 },
      },
    },
  ]);
  const r = rows[0];
  return {
    totalBilled: r?.totalBilled || 0,
    totalPaid: r?.totalPaid || 0,
    balance: r?.balance || 0,
    invoices: r?.invoices || 0,
  };
}

export class PortalService {
  // ------------------------------------------------------------------
  // Profile + children
  // ------------------------------------------------------------------
  static async me(scope: UserScope, user: any) {
    const children = await PortalService.listChildren(scope);
    return {
      id: String(user._id),
      name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      username: user.username,
      role: user.role,
      email: user.email || null,
      phone: user.phone || null,
      children,
    };
  }

  static async listChildren(scope: UserScope) {
    const ids = scope.ownStudentIds || [];
    if (ids.length === 0) return [];
    const students = await Student.find({
      _id: { $in: ids },
      schoolId: scope.schoolId,
      status: { $ne: 'DELETED' },
    })
      .select('firstName lastName fullName admissionNumber classId gender status')
      .populate('classId', 'name')
      .sort({ firstName: 1 })
      .lean();
    return students.map((s: any) => serializeStudent(s));
  }

  static async getChild(scope: UserScope, studentId: string) {
    const student = await loadOwnStudent(scope, studentId);
    return serializeStudent(student, true);
  }

  // ------------------------------------------------------------------
  // Overview dashboard for one child
  // ------------------------------------------------------------------
  static async overview(scope: UserScope, studentId: string) {
    const student = await loadOwnStudent(scope, studentId);

    // Academics: most recent published term
    const latest: any = await Result.findOne({
      schoolId: scope.schoolId,
      studentId,
      published: true,
    })
      .sort({ createdAt: -1 })
      .select('termId sessionId')
      .populate('termId')
      .populate('sessionId')
      .lean();

    let academics: any = null;
    if (latest) {
      const termId = latest.termId?._id || latest.termId;
      const sessionId = latest.sessionId?._id || latest.sessionId;
      const rows: any[] = await Result.find({
        schoolId: scope.schoolId,
        studentId,
        published: true,
        termId,
        sessionId,
      })
        .select('total')
        .lean();
      const totalScore = rows.reduce((sum, r) => sum + (r.total || 0), 0);
      academics = {
        termId: String(termId),
        termName: latest.termId?.name || null,
        sessionId: String(sessionId),
        sessionName: latest.sessionId?.name || null,
        subjects: rows.length,
        totalScore,
        average: rows.length ? round2(totalScore / rows.length) : 0,
      };
    }

    // Attendance: most recent term that has records
    const lastAttendance: any = await Attendance.findOne({
      schoolId: scope.schoolId,
      studentId,
    })
      .sort({ date: -1 })
      .select('termId')
      .lean();
    const attendance = await attendanceSummary(
      buildAttendanceMatch(
        scope,
        studentId,
        lastAttendance ? { termId: String(lastAttendance.termId) } : {}
      )
    );

    const finance = scope.role === 'PARENT' ? await financeTotals(scope, studentId) : null;

    const publishedReportCards = await ReportCard.countDocuments({
      schoolId: scope.schoolId,
      studentId,
      status: 'PUBLISHED',
    });

    return {
      student: serializeStudent(student, true),
      academics,
      attendance,
      finance,
      publishedReportCards,
    };
  }

  // ------------------------------------------------------------------
  // Results (published only), grouped by session and term
  // ------------------------------------------------------------------
  static async results(scope: UserScope, studentId: string, query: any = {}) {
    await loadOwnStudent(scope, studentId);

    const filter: any = { schoolId: scope.schoolId, studentId, published: true };
    const termId = optionalId(query.termId, 'termId');
    const sessionId = optionalId(query.sessionId, 'sessionId');
    if (termId) filter.termId = termId;
    if (sessionId) filter.sessionId = sessionId;

    const rows: any[] = await Result.find(filter)
      .sort({ createdAt: -1 })
      .populate('subjectId', 'name')
      .populate('termId')
      .populate('sessionId')
      .lean();

    const groups = new Map<string, any>();
    for (const r of rows) {
      const termKey = String(r.termId?._id || r.termId);
      const sessionKey = String(r.sessionId?._id || r.sessionId);
      const key = `${sessionKey}:${termKey}`;

      if (!groups.has(key)) {
        groups.set(key, {
          sessionId: sessionKey,
          sessionName: r.sessionId?.name || null,
          termId: termKey,
          termName: r.termId?.name || null,
          subjects: [],
          totalScore: 0,
        });
      }
      const g = groups.get(key);
      g.subjects.push({
        id: String(r._id),
        subjectId: String(r.subjectId?._id || r.subjectId),
        subject: r.subjectId?.name || 'Subject',
        caScore: r.caScore,
        examScore: r.examScore,
        total: r.total,
        grade: r.grade,
        remark: r.remark,
      });
      g.totalScore += r.total || 0;
    }

    return [...groups.values()].map((g) => {
      g.subjects.sort((a: any, b: any) => a.subject.localeCompare(b.subject));
      return {
        ...g,
        subjectCount: g.subjects.length,
        average: g.subjects.length ? round2(g.totalScore / g.subjects.length) : 0,
      };
    });
  }

  // ------------------------------------------------------------------
  // Report cards (published only)
  // ------------------------------------------------------------------
  static async reportCards(scope: UserScope, studentId: string) {
    await loadOwnStudent(scope, studentId);
    return ReportCard.find({
      schoolId: scope.schoolId,
      studentId,
      status: 'PUBLISHED',
    })
      .sort({ publishedAt: -1 })
      .select('-templateId')
      .populate('termId')
      .populate('sessionId')
      .lean();
  }

  static async reportCard(scope: UserScope, studentId: string, id: string) {
    await loadOwnStudent(scope, studentId);
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid report card id');
    const card = await ReportCard.findOne({
      _id: id,
      schoolId: scope.schoolId,
      studentId,
      status: 'PUBLISHED',
    })
      .select('-templateId')
      .populate('termId')
      .populate('sessionId')
      .lean();
    if (!card) throw new NotFoundError('Report card not found');
    return card;
  }

  // ------------------------------------------------------------------
  // Attendance
  // ------------------------------------------------------------------
  static async attendance(scope: UserScope, studentId: string, query: any = {}) {
    await loadOwnStudent(scope, studentId);
    const match = buildAttendanceMatch(scope, studentId, query);
    const [summary, records] = await Promise.all([
      attendanceSummary(match),
      Attendance.find(match)
        .sort({ date: -1 })
        .limit(400)
        .select('date status remark termId sessionId')
        .lean(),
    ]);
    return { summary, records };
  }

  // ------------------------------------------------------------------
  // Finance (parents only)
  // ------------------------------------------------------------------
  static async financeSummary(scope: UserScope, studentId: string) {
    requireFinance(scope);
    await loadOwnStudent(scope, studentId);
    return financeTotals(scope, studentId);
  }

  static async invoices(scope: UserScope, studentId: string) {
    requireFinance(scope);
    await loadOwnStudent(scope, studentId);
    return Invoice.find({
      schoolId: scope.schoolId,
      studentId,
      status: { $ne: 'CANCELLED' },
    })
      .sort({ createdAt: -1 })
      .populate('termId')
      .populate('sessionId')
      .lean();
  }

  static async payments(scope: UserScope, studentId: string) {
    requireFinance(scope);
    await loadOwnStudent(scope, studentId);
    return Payment.find({ schoolId: scope.schoolId, studentId })
      .sort({ createdAt: -1 })
      .limit(200)
      .select('-providerPayload -providerReference -submittedBy -approvedBy -rejectedBy')
      .lean();
  }
}
