// src/core/reportCards/reportCard.service.ts
import mongoose from 'mongoose';
import { Student } from '../../models/Student';
import { Class } from '../../models/Class';
import { Result } from '../../models/Result';
import { Subject } from '../../models/Subject';
import { ReportCardTemplate } from '../../models/ReportCardTemplate';
import logger from '../../config/logger';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';

export class ReportCardService {
  // ------------------------------------------------------------------
  // Single-student generation (existing)
  // ------------------------------------------------------------------
  static async generateForStudent(
    schoolId: string,
    studentId: string,
    sessionId: string,
    termId: string
  ) {
    if (!mongoose.isValidObjectId(studentId)) {
      throw new BadRequestError('Invalid student id');
    }

    const student: any = await Student.findOne({ _id: studentId, schoolId })
      .populate('classId', 'name')
      .lean();
    if (!student) throw new NotFoundError('Student not found');

    const results = await Result.find({
      schoolId,
      studentId,
      sessionId,
      termId,
    })
      .populate('subjectId', 'name code')
      .lean();

    const subjects = results.map((r: any) => {
      const total = (r.caScore || 0) + (r.examScore || 0);
      return {
        subjectId: r.subjectId?._id || r.subjectId,
        name: r.subjectId?.name || r.subjectName || 'Subject',
        ca: r.caScore || 0,
        exam: r.examScore || 0,
        total,
        grade: r.grade || gradeFor(total),
        remark: r.remark || '',
      };
    });

    const average =
      subjects.length > 0
        ? Math.round(subjects.reduce((s, x) => s + x.total, 0) / subjects.length)
        : 0;

    const ReportCard = mongoose.model('ReportCard');
    const card = await ReportCard.findOneAndUpdate(
      { schoolId, studentId, sessionId, termId },
      {
        $set: {
          schoolId,
          studentId,
          classId: student.classId?._id || student.classId,
          sessionId,
          termId,
          studentName:
            student.fullName ||
            `${student.firstName || ''} ${student.lastName || ''}`.trim(),
          className: student.classId?.name || '',
          admissionNumber: student.admissionNumber || '',
          subjects,
          average,
          grade: gradeFor(average),
          remark: remarkFor(average),
          compiledAt: new Date(),
        },
      },
      { new: true, upsert: true }
    );

    return card;
  }

  // ------------------------------------------------------------------
  // Class-wide compilation (batched)
  // ------------------------------------------------------------------
  static async generateForClass(
    schoolId: string,
    classId: string,
    sessionId: string,
    termId: string
  ) {
    if (!mongoose.isValidObjectId(classId)) {
      throw new BadRequestError('Invalid class id');
    }

    const [students, subjects] = await Promise.all([
      Student.find({ schoolId, classId, status: 'ACTIVE' })
        .select('_id firstName lastName fullName admissionNumber')
        .lean(),
      Subject.find({ schoolId, isActive: true }).select('_id name code classIds').lean(),
    ]);

    if (students.length === 0) {
      return { count: 0, students: 0, message: 'No active students in this class' };
    }

    const studentIds = students.map((s: any) => s._id);

    const results = await Result.find({
      schoolId,
      studentId: { $in: studentIds },
      sessionId,
      termId,
    })
      .populate('subjectId', 'name code')
      .lean();

    const resultsByStudent = new Map<string, any[]>();
    for (const r of results) {
      const sid = String((r as any).studentId?._id || (r as any).studentId);
      if (!resultsByStudent.has(sid)) resultsByStudent.set(sid, []);
      resultsByStudent.get(sid)!.push(r);
    }

    const ReportCard = mongoose.model('ReportCard');
    const upserts: any[] = [];

    for (const student of students) {
      const sid = String((student as any)._id);
      const studentResults = resultsByStudent.get(sid) || [];

      const subjectRows = studentResults.map((r: any) => {
        const total = (r.caScore || 0) + (r.examScore || 0);
        return {
          subjectId: r.subjectId?._id || r.subjectId,
          name: r.subjectId?.name || r.subjectName || 'Subject',
          ca: r.caScore || 0,
          exam: r.examScore || 0,
          total,
          grade: r.grade || gradeFor(total),
          remark: r.remark || '',
        };
      });

      const average =
        subjectRows.length > 0
          ? Math.round(
              subjectRows.reduce((sum, r) => sum + r.total, 0) / subjectRows.length
            )
          : 0;

      upserts.push({
        updateOne: {
          filter: { schoolId, studentId: (student as any)._id, sessionId, termId },
          update: {
            $set: {
              schoolId,
              studentId: (student as any)._id,
              classId,
              sessionId,
              termId,
              studentName:
                (student as any).fullName ||
                `${(student as any).firstName || ''} ${(student as any).lastName || ''}`.trim(),
              admissionNumber: (student as any).admissionNumber || '',
              subjects: subjectRows,
              average,
              grade: gradeFor(average),
              remark: remarkFor(average),
              compiledAt: new Date(),
            },
          },
          upsert: true,
        },
      });
    }

    if (upserts.length > 0) {
      await ReportCard.bulkWrite(upserts, { ordered: false });
    }

    logger.info(`Report cards compiled for class ${classId}: ${upserts.length} students`);

    return {
      count: upserts.length,
      students: students.length,
      classId,
    };
  }

  // ------------------------------------------------------------------
  // School-wide compilation
  // ------------------------------------------------------------------
  static async generateForSchool(
    schoolId: string,
    sessionId: string,
    termId: string
  ) {
    const classes = await Class.find({ schoolId }).select('_id name').lean();
    if (classes.length === 0) {
      throw new BadRequestError('No classes in this school');
    }

    let totalCompiled = 0;
    const perClass: any[] = [];
    const errors: any[] = [];

    for (const cls of classes) {
      try {
        const result = await ReportCardService.generateForClass(
          schoolId,
          String((cls as any)._id),
          sessionId,
          termId
        );
        totalCompiled += result.count;
        perClass.push({
          classId: String((cls as any)._id),
          className: (cls as any).name,
          compiled: result.count,
        });
      } catch (err: any) {
        errors.push({
          classId: String((cls as any)._id),
          className: (cls as any).name,
          error: err?.message || 'unknown',
        });
      }
    }

    logger.info(
      `Report cards compiled for school ${schoolId}: ${totalCompiled} total across ${classes.length} classes`
    );

    return {
      count: totalCompiled,
      classes: classes.length,
      perClass,
      errors,
    };
  }

  /**
   * Called by report.worker.ts when a batch job runs. Accepts a
   * schoolId plus optional session/term, and compiles for the whole
   * school. Alias of generateForSchool with the same return shape.
   */
  static async processSchoolBatch(
    schoolId: string,
    sessionId: string,
    termId: string
  ) {
    return ReportCardService.generateForSchool(schoolId, sessionId, termId);
  }

  /**
   * Process a class batch — same idea for the worker's per-class job.
   */
  static async processClassBatch(
    schoolId: string,
    classId: string,
    sessionId: string,
    termId: string
  ) {
    return ReportCardService.generateForClass(schoolId, classId, sessionId, termId);
  }
}

// ------------------------------------------------------------------
// Grade/remark helpers
// ------------------------------------------------------------------
function gradeFor(total: number): string {
  if (total >= 75) return 'A';
  if (total >= 65) return 'B';
  if (total >= 55) return 'C';
  if (total >= 45) return 'D';
  if (total >= 40) return 'E';
  return 'F';
}

function remarkFor(avg: number): string {
  if (avg >= 75) return 'Excellent performance.';
  if (avg >= 65) return 'Very good result.';
  if (avg >= 55) return 'Good effort.';
  if (avg >= 45) return 'Fair performance.';
  return 'Needs improvement.';
}
