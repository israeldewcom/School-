import { ReportCard } from '../../models/ReportCard';
import { ReportCardTemplate } from '../../models/ReportCardTemplate';
import { Student } from '../../models/Student';
import { Result } from '../../models/Result';
import { Attendance } from '../../models/Attendance';
import { pdfQueue, emailQueue } from '../../jobs/queues';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { Class } from '../../models/Class';

export class ReportCardService {
  static async generateReportCard(studentId: string, sessionId: string, termId: string, templateId?: string) {
    const student = await Student.findById(studentId)
      .populate('classId', 'name')
      .select('firstName lastName admissionNumber schoolId classId photo');
    if (!student) throw new NotFoundError('Student not found');

    let template;
    if (templateId) {
      template = await ReportCardTemplate.findOne({
        _id: templateId,
        schoolId: student.schoolId,
        isActive: true,
      });
    } else {
      template = await ReportCardTemplate.findOne({
        schoolId: student.schoolId,
        isDefault: true,
        isActive: true,
      });
    }
    if (!template) throw new NotFoundError('Report card template not found');

    const results = await Result.find({
      studentId,
      sessionId,
      termId,
    }).populate('subjectId', 'name');

    const attendance = await Attendance.aggregate([
      { $match: { studentId, sessionId, termId } },
      {
        $group: {
          _id: null,
          present: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'ABSENT'] }, 1, 0] } },
        },
      },
    ]);
    const att = attendance[0] || { present: 0, absent: 0 };
    const totalDays = att.present + att.absent;
    const attendancePercent = totalDays > 0 ? (att.present / totalDays) * 100 : 0;

    // Compute class average and position for this student
    const classId = student.classId?._id?.toString() || student.classId?.toString();
    const allResults = await Result.find({ classId, sessionId, termId }).populate('subjectId');
    // Compute per-subject averages and overall average
    const subjectMap = new Map<string, { total: number; count: number }>();
    let overallTotal = 0;
    let overallCount = 0;
    for (const r of allResults) {
      const subjId = r.subjectId._id.toString();
      const total = r.total || 0;
      if (!subjectMap.has(subjId)) {
        subjectMap.set(subjId, { total: 0, count: 0 });
      }
      const entry = subjectMap.get(subjId)!;
      entry.total += total;
      entry.count += 1;
      overallTotal += total;
      overallCount += 1;
    }
    const subjectAverages: Record<string, number> = {};
    for (const [subjId, entry] of subjectMap.entries()) {
      subjectAverages[subjId] = entry.count > 0 ? entry.total / entry.count : 0;
    }
    const classAverage = overallCount > 0 ? overallTotal / overallCount : 0;

    // Calculate position for this student
    const studentTotal = results.reduce((sum, r) => sum + (r.total || 0), 0);
    // Get all student totals for this class/term
    const studentTotals = await Result.aggregate([
      { $match: { classId, sessionId, termId } },
      {
        $group: {
          _id: '$studentId',
          total: { $sum: '$total' },
        },
      },
      { $sort: { total: -1 } },
    ]);
    let position = 0;
    for (let i = 0; i < studentTotals.length; i++) {
      if (studentTotals[i]._id.toString() === studentId) {
        position = i + 1;
        break;
      }
    }

    const reportData = {
      student: {
        name: `${student.firstName} ${student.lastName}`,
        admissionNumber: student.admissionNumber,
        class: (student.classId as any).name,
        photo: student.photo,
      },
      results: results.map((r) => ({
        subject: (r as any).subjectId.name,
        ca: r.caScore,
        exam: r.examScore,
        total: r.total,
        grade: r.grade,
        remark: r.remark,
      })),
      attendance: {
        present: att.present,
        absent: att.absent,
        total: totalDays,
        percentage: attendancePercent,
      },
      classAverage: classAverage,
      position: position,
      teacherComment: '',
      principalComment: '',
    };

    const reportCard = new ReportCard({
      schoolId: student.schoolId,
      studentId: student._id,
      sessionId,
      termId,
      templateId: template._id,
      templateVersion: template.version,
      data: reportData,
      status: 'DRAFT',
    });
    await reportCard.save();

    await pdfQueue.add('generate-report-pdf', { reportCardId: reportCard._id });

    return reportCard;
  }

  // NEW: Bulk generate for entire class with averages and positions already computed
  static async generateForClass(classId: string, sessionId: string, termId: string, templateId?: string) {
    const classDoc = await Class.findById(classId);
    if (!classDoc) throw new NotFoundError('Class not found');

    const students = await Student.find({ classId, status: 'ACTIVE' });
    const reports = [];
    for (const student of students) {
      const report = await this.generateReportCard(student._id.toString(), sessionId, termId, templateId);
      reports.push(report);
    }
    return reports;
  }

  static async publishReportCard(reportCardId: string, publishedBy: string) {
    const reportCard = await ReportCard.findById(reportCardId);
    if (!reportCard) throw new NotFoundError('Report card not found');
    if (reportCard.status !== 'GENERATED') {
      throw new BadRequestError('Report card must be generated first');
    }
    reportCard.status = 'PUBLISHED';
    reportCard.publishedAt = new Date();
    await reportCard.save();

    await emailQueue.add('send-report-card-notification', { reportCardId });

    return reportCard;
  }
}
