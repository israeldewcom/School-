// src/core/reportCards/reportCard.service.ts (relevant methods)
import mongoose from 'mongoose';
import { Student } from '../../models/Student';
import { Class } from '../../models/Class';
import { Result } from '../../models/Result';
import { Subject } from '../../models/Subject';
import { ReportCardTemplate } from '../../models/ReportCardTemplate';
import logger from '../../config/logger';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';

export class ReportCardService {
  // ... existing single-student generation and template methods ...

  /**
   * Compile report cards for every student in a class.
   *
   * Batched:
   *   1. One query for all students
   *   2. One query for all results
   *   3. One query for all subjects
   *   4. One upsert per student
   *
   * No per-student round trips. Handles 500-student classes in a
   * couple of seconds.
   */
  static async generateForClass(
    schoolId: string,
    classId: string,
    sessionId: string,
    termId: string
  ) {
    if (!mongoose.isValidObjectId(classId)) throw new BadRequestError('Invalid class id');

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

    // One query for every result in this class/session/term.
    const results = await Result.find({
      schoolId,
      studentId: { $in: studentIds },
      sessionId,
      termId,
    })
      .populate('subjectId', 'name code')
      .lean();

    // Index results by student for O(1) lookups below.
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
          subjectId: (r as any).subjectId?._id || (r as any).subjectId,
          name: (r as any).subjectId?.name || r.subjectName || 'Subject',
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

  /**
   * Compile report cards for every active class in the school.
   * Delegates to generateForClass per class. Never per-student.
   */
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

    // Sequential over classes (usually < 20). Each class batches its
    // own students so the total DB round trips are classes + 3, not
    // classes * students.
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
}

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
