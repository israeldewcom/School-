import { ReportCard } from '../../models/ReportCard';
import { ReportCardTemplate } from '../../models/ReportCardTemplate';
import { Student } from '../../models/Student';
import { Result } from '../../models/Result';
import { Attendance } from '../../models/Attendance';
import { BatchJob } from '../../models/BatchJob';
import { pdfQueue, emailQueue, reportQueue } from '../../jobs/queues';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { Class } from '../../models/Class';
import { mergePDFsFromUrls } from '../../utils/pdfMerge';
import logger from '../../config/logger';

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
    const classAverage = overallCount > 0 ? overallTotal / overallCount : 0;

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

  // ------------------------------------------------------------------
  // Whole-school batch generation. This queues a background job rather
  // than generating synchronously — for a school with hundreds of
  // students, doing this inline would time out the HTTP request.
  // ------------------------------------------------------------------
  static async generateForSchool(
    schoolId: string,
    sessionId: string,
    termId: string,
    startedBy: string,
    templateId?: string
  ) {
    const studentCount = await Student.countDocuments({ schoolId, status: 'ACTIVE' });
    if (studentCount === 0) {
      throw new BadRequestError('No active students found for this school');
    }

    const batch = new BatchJob({
      schoolId,
      type: 'REPORT_CARDS',
      sessionId,
      termId,
      status: 'PENDING',
      totalCount: studentCount,
      startedBy,
    });
    await batch.save();

    await reportQueue.add('generate-school-report-cards', {
      batchId: batch._id.toString(),
      schoolId,
      sessionId,
      termId,
      templateId,
    });

    return batch;
  }

  // Called by the worker, not directly by a controller.
  static async processSchoolBatch(
    batchId: string,
    schoolId: string,
    sessionId: string,
    termId: string,
    templateId?: string
  ) {
    const batch = await BatchJob.findById(batchId);
    if (!batch) {
      logger.error(`processSchoolBatch: batch ${batchId} not found`);
      return;
    }

    batch.status = 'PROCESSING';
    await batch.save();

    const students = await Student.find({ schoolId, status: 'ACTIVE' }).select('_id');

    // Process in small concurrent chunks rather than one-at-a-time (slow)
    // or all-at-once (risks overwhelming Cloudinary/Mongo). 5 at a time is
    // a reasonable default for typical hosting tiers.
    const CHUNK_SIZE = 5;
    for (let i = 0; i < students.length; i += CHUNK_SIZE) {
      const chunk = students.slice(i, i + CHUNK_SIZE);
      const results = await Promise.allSettled(
        chunk.map((s) =>
          this.generateReportCard(s._id.toString(), sessionId, termId, templateId)
        )
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        batch.processedCount += 1;
        if (result.status === 'fulfilled') {
          batch.successCount += 1;
          batch.itemIds.push(result.value._id as any);
        } else {
          batch.failureCount += 1;
          batch.failures.push({
            studentId: chunk[j]._id.toString(),
            reason: result.reason?.message || 'Unknown error',
          });
        }
      }
      await batch.save();
    }

    batch.status = 'COMPLETED';
    batch.completedAt = new Date();
    await batch.save();

    logger.info(`Report card batch ${batchId} completed: ${batch.successCount}/${batch.totalCount} succeeded`);
  }

  static async getBatch(batchId: string, schoolId: string) {
    const batch = await BatchJob.findOne({ _id: batchId, schoolId, type: 'REPORT_CARDS' });
    if (!batch) throw new NotFoundError('Batch not found');
    return batch;
  }

  // ------------------------------------------------------------------
  // Edit a report card before publishing. Since the PDF is generated
  // ahead of time (for speed), editing the data afterward means the
  // stored PDF is now stale — so we regenerate it here rather than
  // leave a printed document that disagrees with the saved record.
  // ------------------------------------------------------------------
  static async updateReportCard(id: string, schoolId: string, data: any) {
    const reportCard = await ReportCard.findOne({ _id: id, schoolId });
    if (!reportCard) throw new NotFoundError('Report card not found');
    if (reportCard.status === 'PUBLISHED') {
      throw new BadRequestError('Cannot edit a published report card');
    }

    // Only allow editing the fields a reviewer would realistically touch —
    // not identity/linkage fields like studentId or templateId.
    const editable = ['results', 'teacherComment', 'principalComment', 'attendance', 'classAverage', 'position'];
    for (const key of editable) {
      if (data[key] !== undefined) {
        (reportCard.data as any)[key] = data[key];
      }
    }
    reportCard.status = 'DRAFT';
    await reportCard.save();

    // Regenerate the PDF so it reflects the edit before anyone publishes/prints it.
    await pdfQueue.add('generate-report-pdf', { reportCardId: reportCard._id });

    return reportCard;
  }

  static async publishReportCard(reportCardId: string, _publishedBy: string) {
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

  // Bulk-publish every GENERATED report card in a batch after admin review.
  static async publishBatch(batchId: string, schoolId: string, _publishedBy: string) {
    const batch = await BatchJob.findOne({ _id: batchId, schoolId, type: 'REPORT_CARDS' });
    if (!batch) throw new NotFoundError('Batch not found');
    if (batch.status !== 'COMPLETED') {
      throw new BadRequestError('Batch has not finished processing yet');
    }

    const reportCards = await ReportCard.find({ _id: { $in: batch.itemIds }, status: 'GENERATED' });
    const published = [];
    for (const rc of reportCards) {
      rc.status = 'PUBLISHED';
      rc.publishedAt = new Date();
      await rc.save();
      await emailQueue.add('send-report-card-notification', { reportCardId: rc._id });
      published.push(rc._id);
    }

    return { publishedCount: published.length, totalInBatch: batch.itemIds.length };
  }

  // Merge every generated PDF in a completed batch into one printable file.
  static async printBatch(batchId: string, schoolId: string): Promise<Buffer> {
    const batch = await BatchJob.findOne({ _id: batchId, schoolId, type: 'REPORT_CARDS' });
    if (!batch) throw new NotFoundError('Batch not found');
    if (batch.status !== 'COMPLETED') {
      throw new BadRequestError('Batch has not finished processing yet');
    }

    const reportCards = await ReportCard.find({ _id: { $in: batch.itemIds }, pdfUrl: { $ne: null } })
      .sort({ 'data.student.name': 1 });
    if (reportCards.length === 0) {
      throw new BadRequestError('No generated PDFs found in this batch');
    }

    const urls = reportCards.map((rc) => rc.pdfUrl!).filter(Boolean);
    return mergePDFsFromUrls(urls);
  }
}
