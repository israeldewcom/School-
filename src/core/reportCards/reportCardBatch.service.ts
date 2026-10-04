// src/core/reportCards/reportCardBatch.service.ts
//
// Compile, publish and print report cards for a whole class in one go:
// grades from the school's grading scale, class position (ties share a rank),
// class average, term attendance, teacher/principal remarks, one merged PDF.
import mongoose from 'mongoose';
import { Student } from '../../models/Student';
import { Class } from '../../models/Class';
import { Result } from '../../models/Result';
import { Attendance } from '../../models/Attendance';
import { TermRemark } from '../../models/TermRemark';
import { GradeScale, DEFAULT_BANDS, IGradeBand } from '../../models/GradeScale';
import { ReportCard } from '../../models/ReportCard';
import { ReportCardTemplate } from '../../models/ReportCardTemplate';
import { Invoice } from '../../models/Invoice';
import { School } from '../../models/School';
import { Session } from '../../models/Session';
import { Term } from '../../models/Term';
import { ReportCardRendererService, RenderData } from './reportCardRenderer.service';
import { renderReportCardPDF } from '../../utils/pdfGenerator';
import { mergePdfBuffers } from '../../utils/pdfMerge';
import { Notifier } from '../../services/notifier.service';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';
import { logoPngBuffer } from '../branding/logo.service';
import logger from '../../config/logger';

function bandFor(bands: IGradeBand[], total: number): { grade: string; remark: string } {
  const t = Math.round(total * 100) / 100;
  const b = bands.find((x) => t >= x.min && t <= x.max) || bands[bands.length - 1];
  return { grade: b?.grade || '-', remark: b?.remark || '' };
}

function checkIds(classId: string, sessionId: string, termId: string) {
  for (const [label, v] of [['classId', classId], ['sessionId', sessionId], ['termId', termId]] as const) {
    if (!v || !mongoose.isValidObjectId(v)) throw new BadRequestError(`${label} is required`);
  }
}

async function defaultTemplate(schoolId: string, templateId?: string): Promise<any | null> {
  if (templateId && mongoose.isValidObjectId(templateId)) {
    return ReportCardTemplate.findOne({ _id: templateId, schoolId, type: 'report_card' });
  }
  return ReportCardTemplate.findOne({ schoolId, type: 'report_card', isActive: true }).sort({ isDefault: -1, createdAt: -1 });
}

export class ReportCardBatchService {
  /**
   * Build (or rebuild) every active student's report card for the class/term.
   * Safe to run repeatedly; a card that is already published stays published.
   */
  static async compileClass(
    schoolId: string,
    classId: string,
    sessionId: string,
    termId: string,
    opts: { nextTermBegins?: string } = {}
  ) {
    checkIds(classId, sessionId, termId);
    const sid = new mongoose.Types.ObjectId(schoolId);

    const [cls, students, scale, session, term, template]: any[] = await Promise.all([
      Class.findOne({ _id: classId, schoolId }).select('name').lean(),
      Student.find({ schoolId, classId, status: 'ACTIVE' }).select('firstName lastName fullName admissionNumber gender dateOfBirth photo').sort({ firstName: 1 }).lean(),
      GradeScale.findOne({ schoolId }).lean(),
      Session.findOne({ _id: sessionId, schoolId }).select('name').lean(),
      Term.findOne({ _id: termId, schoolId }).select('name').lean(),
      defaultTemplate(schoolId),
    ]);
    if (!cls) throw new NotFoundError('Class not found');
    if (students.length === 0) return { count: 0, students: 0, classId, message: 'No active students in this class' };

    const bands: IGradeBand[] = (scale as any)?.bands?.length ? (scale as any).bands : DEFAULT_BANDS;
    const studentIds = students.map((s: any) => s._id);

    const [results, attendanceRows, remarks]: any[] = await Promise.all([
      Result.find({ schoolId, studentId: { $in: studentIds }, sessionId, termId }).populate('subjectId', 'name').lean(),
      Attendance.aggregate([
        { $match: { schoolId: sid, studentId: { $in: studentIds }, termId: new mongoose.Types.ObjectId(termId) } },
        { $group: { _id: { s: '$studentId', st: '$status' }, c: { $sum: 1 } } },
      ]),
      TermRemark.find({ schoolId, studentId: { $in: studentIds }, sessionId, termId }).lean(),
    ]);

    const resultsBy = new Map<string, any[]>();
    for (const r of results) {
      const k = String(r.studentId);
      (resultsBy.get(k) || resultsBy.set(k, []).get(k)!).push(r);
    }
    const remarkBy = new Map<string, any>(remarks.map((r: any) => [String(r.studentId), r]));
    const att = new Map<string, { present: number; absent: number; total: number }>();
    for (const a of attendanceRows) {
      const k = String(a._id.s);
      const cur = att.get(k) || { present: 0, absent: 0, total: 0 };
      cur.total += a.c;
      if (a._id.st === 'PRESENT' || a._id.st === 'LATE') cur.present += a.c;
      else cur.absent += a.c;
      att.set(k, cur);
    }

    // Per-student totals + ranking
    const rows: any[] = students.map((s: any) => {
      const subj = (resultsBy.get(String(s._id)) || []).map((r: any) => {
        const total = typeof r.total === 'number' ? r.total : (r.caScore || 0) + (r.examScore || 0);
        const b = bandFor(bands, total);
        return {
          subject: r.subjectId?.name || 'Subject',
          ca: r.caScore || 0,
          exam: r.examScore || 0,
          total,
          grade: r.grade || b.grade,
          remark: r.remark || b.remark,
        };
      }).sort((a, b) => a.subject.localeCompare(b.subject));
      const sum = subj.reduce((a, x) => a + x.total, 0);
      const average = subj.length ? Math.round((sum / subj.length) * 10) / 10 : 0;
      return { s, subj, average, hasResults: subj.length > 0 };
    });

    const ranked: any[] = rows.filter((r) => r.hasResults).sort((a, b) => b.average - a.average);
    const positionOf = new Map<string, number>();
    ranked.forEach((r, i) => {
      const prev = ranked[i - 1];
      positionOf.set(String(r.s._id), prev && prev.average === r.average ? positionOf.get(String(prev.s._id))! : i + 1);
    });
    const classAverage = ranked.length ? Math.round((ranked.reduce((a, r) => a + r.average, 0) / ranked.length) * 10) / 10 : 0;

    const ops = rows.map((r) => {
      const k = String(r.s._id);
      const a = att.get(k) || { present: 0, absent: 0, total: 0 };
      const tr = remarkBy.get(k);
      return {
        updateOne: {
          filter: { schoolId: sid, studentId: r.s._id, sessionId, termId },
          update: {
            $set: {
              classId,
              templateId: template?._id,
              templateVersion: template?.version || 1,
              generatedAt: new Date(),
              data: {
                student: {
                  name: r.s.fullName || `${r.s.firstName} ${r.s.lastName}`.trim(),
                  admissionNumber: r.s.admissionNumber || '-',
                  class: cls.name,
                  photo: r.s.photo || undefined,
                },
                results: r.subj,
                attendance: { ...a, percentage: a.total ? Math.round((a.present / a.total) * 100) : 0 },
                classAverage,
                position: positionOf.get(k),
                classSize: students.length,
                average: r.average,
                grade: r.hasResults ? bandFor(bands, r.average).grade : '-',
                sessionName: session?.name || '',
                termName: term?.name || '',
                nextTermBegins: opts.nextTermBegins || undefined,
                gender: r.s.gender || undefined,
                dateOfBirth: r.s.dateOfBirth ? new Date(r.s.dateOfBirth).toLocaleDateString('en-NG') : undefined,
                teacherComment: tr?.teacherComment || '',
                principalComment: tr?.principalComment || '',
              },
            },
            $setOnInsert: { status: 'GENERATED' },
          },
          upsert: true,
        },
      };
    });
    await ReportCard.bulkWrite(ops as any, { ordered: false });

    logger.info(`Report cards compiled for class ${classId}: ${ops.length} students, ${ranked.length} with results`);
    return {
      count: ops.length,
      students: students.length,
      withResults: ranked.length,
      withoutResults: students.length - ranked.length,
      classAverage,
      classId,
    };
  }

  /**
   * Release the class's report cards to parents/students. With
   * `withholdOwing`, students who still owe fees are skipped (and listed).
   */
  static async publishClass(
    schoolId: string,
    userId: string,
    classId: string,
    sessionId: string,
    termId: string,
    opts: { withholdOwing?: boolean } = {}
  ) {
    checkIds(classId, sessionId, termId);
    const cards: any[] = await ReportCard.find({ schoolId, classId, sessionId, termId }).select('studentId status data.student.name').lean();
    if (cards.length === 0) throw new BadRequestError('Nothing compiled yet. Compile the class report cards first.');

    let withheld: Array<{ studentId: string; name: string; owing: number }> = [];
    let release = cards;

    if (opts.withholdOwing) {
      const owing = await Invoice.aggregate([
        { $match: { schoolId: new mongoose.Types.ObjectId(schoolId), studentId: { $in: cards.map((c) => c.studentId) }, status: { $nin: ['CANCELLED', 'DRAFT'] } } },
        { $group: { _id: '$studentId', owed: { $sum: { $subtract: ['$total', '$amountPaid'] } } } },
        { $match: { owed: { $gt: 0 } } },
      ]);
      const owedBy = new Map<string, number>(owing.map((o: any) => [String(o._id), o.owed]));
      withheld = cards
        .filter((c) => owedBy.has(String(c.studentId)))
        .map((c) => ({ studentId: String(c.studentId), name: c.data?.student?.name || '', owing: owedBy.get(String(c.studentId))! }));
      release = cards.filter((c) => !owedBy.has(String(c.studentId)));
    }

    const ids = release.map((c) => c._id);
    const studentIds = release.map((c) => c.studentId);
    await ReportCard.updateMany({ _id: { $in: ids } }, { $set: { status: 'PUBLISHED', publishedAt: new Date() } });
    // Parents read results only when published, so release the term's results too.
    await Result.updateMany(
      { schoolId, studentId: { $in: studentIds }, sessionId, termId, published: false },
      { $set: { published: true, publishedAt: new Date(), publishedBy: userId } }
    );

    const school: any = await School.findById(schoolId).select('name').lean();
    const alreadyOut = new Set(cards.filter((c) => c.status === 'PUBLISHED').map((c) => String(c._id)));
    const toNotify = release.filter((c) => !alreadyOut.has(String(c._id))).map((c) => c.studentId);
    void Notifier.families(schoolId, toNotify, {
      title: 'Report card ready',
      body: 'The term report card is now available in the parent portal.',
      sms: `${school?.name || 'School'}: the term report card is now available in the parent portal.`,
      smsSetting: 'smsOnReportCard',
      metadata: { kind: 'REPORT_CARD', termId },
    });

    return { published: release.length, notified: toNotify.length, withheld };
  }

  // ------------------------------------------------------------------
  // PDF
  // ------------------------------------------------------------------
  static toRenderData(card: any, school: { name: string; address?: string }): RenderData {
    const d = card.data || {};
    return {
      student: {
        fullName: d.student?.name || '',
        admissionNumber: d.student?.admissionNumber || '',
        className: d.student?.class || '',
        dateOfBirth: d.dateOfBirth,
        gender: d.gender,
      },
      session: d.sessionName || '',
      term: d.termName || '',
      school: { name: school.name, address: school.address },
      results: (d.results || []).map((r: any) => ({ subjectName: r.subject, ca: r.ca, exam: r.exam, total: r.total, grade: r.grade, remark: r.remark })),
      average: d.average ?? 0,
      grade: d.grade || '',
      position: d.position,
      classSize: d.classSize,
      attendance: d.attendance ? { present: d.attendance.present, absent: d.attendance.absent, total: d.attendance.total } : undefined,
      nextTermBegins: d.nextTermBegins,
      teacherRemark: d.teacherComment,
      principalRemark: d.principalComment,
    };
  }

  /** Render one stored card. Uses the school's template when it has one, else the built-in layout. */
  static async renderCard(schoolId: string, card: any, templateId?: string): Promise<Buffer> {
    const [school, template]: any[] = await Promise.all([
      School.findById(schoolId).select('name address phone logo').lean(),
      defaultTemplate(schoolId, templateId),
    ]);
    const schoolInfo = { name: school?.name || 'School', address: school?.address, phone: school?.phone };

    if (template) {
      return ReportCardRendererService.renderReportCard(schoolId, String(template._id), ReportCardBatchService.toRenderData(card, schoolInfo));
    }

    const d = card.data || {};
    return renderReportCardPDF({
      template: {
        layout: 'A4_PORTRAIT',
        config: {
          showLogo: true, showSchoolInfo: true, showStudentPhoto: false, showAttendance: true,
          showClassAverage: true, showGrade: true, showRemark: true, showTeacherComment: true,
          showPrincipalComment: true, showSignature: true, showStamp: false, fields: [],
        },
      },
      school: { ...schoolInfo, logo: undefined, logoPng: (await logoPngBuffer(school?.logo)) || undefined },
      data: {
        student: { name: d.student?.name || '', admissionNumber: d.student?.admissionNumber || '', class: d.student?.class || '' },
        results: d.results || [],
        attendance: d.attendance || { present: 0, absent: 0, total: 0, percentage: 0 },
        classAverage: d.classAverage ?? d.average ?? 0,
        position: d.position,
        classSize: d.classSize,
        session: d.sessionName || '',
        term: d.termName || '',
        nextTermBegins: d.nextTermBegins,
        teacherComment: d.teacherComment,
        principalComment: d.principalComment,
      },
    });
  }

  /** One merged PDF for the whole class, one report card per student. */
  static async renderClassPdf(schoolId: string, classId: string, sessionId: string, termId: string, opts: { templateId?: string; nextTermBegins?: string; onlyPublished?: boolean } = {}) {
    // Always recompile so the printout reflects the latest scores, positions and remarks.
    const summary = await ReportCardBatchService.compileClass(schoolId, classId, sessionId, termId, { nextTermBegins: opts.nextTermBegins });
    if (!summary.count) throw new BadRequestError('No active students in this class.');

    const filter: any = { schoolId, classId, sessionId, termId };
    if (opts.onlyPublished) filter.status = 'PUBLISHED';
    const cards: any[] = await ReportCard.find(filter).sort({ 'data.student.name': 1 }).lean();
    if (cards.length === 0) throw new BadRequestError('No report cards to print.');

    const buffers: Buffer[] = [];
    for (const c of cards) buffers.push(await ReportCardBatchService.renderCard(schoolId, c, opts.templateId));
    const className = cards[0]?.data?.student?.class || 'class';
    return { pdf: await mergePdfBuffers(buffers), count: cards.length, filename: `report-cards-${String(className).replace(/[^A-Za-z0-9]+/g, '-')}.pdf` };
  }

  static async renderStudentPdf(schoolId: string, studentId: string, sessionId: string, termId: string, templateId?: string) {
    if (!mongoose.isValidObjectId(studentId)) throw new BadRequestError('Invalid student id');
    const student: any = await Student.findOne({ _id: studentId, schoolId }).select('classId').lean();
    if (!student) throw new NotFoundError('Student not found');
    await ReportCardBatchService.compileClass(schoolId, String(student.classId), sessionId, termId);
    const card = await ReportCard.findOne({ schoolId, studentId, sessionId, termId }).lean();
    if (!card) throw new NotFoundError('Report card not found');
    return ReportCardBatchService.renderCard(schoolId, card, templateId);
  }
}

// logoPngBuffer is re-exported so report workers can embed logos in the future.
export { logoPngBuffer };
