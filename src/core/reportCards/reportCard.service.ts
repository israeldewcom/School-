// src/core/reportCards/reportCard.service.ts
import mongoose from 'mongoose';
import { Student } from '../../models/Student';
import { Class } from '../../models/Class';
import { Result } from '../../models/Result';
import { Subject } from '../../models/Subject';
import { ReportCardTemplate } from '../../models/ReportCardTemplate';
import logger from '../../config/logger';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';
import { ReportCard } from '../../models/ReportCard';
import { ReportCardBatchService } from './reportCardBatch.service';

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
    const student: any = await Student.findOne({ _id: studentId, schoolId }).select('classId').lean();
    if (!student) throw new NotFoundError('Student not found');
    // Compile the whole class so position and class average are right.
    await ReportCardBatchService.compileClass(schoolId, String(student.classId), sessionId, termId);
    const card = await ReportCard.findOne({ schoolId, studentId, sessionId, termId }).lean();
    if (!card) throw new NotFoundError('Report card not found');
    return card;
  }

  static async generateForClass(
    schoolId: string,
    classId: string,
    sessionId: string,
    termId: string,
    opts: { nextTermBegins?: string } = {}
  ) {
    if (!mongoose.isValidObjectId(classId)) {
      throw new BadRequestError('Invalid class id');
    }
    return ReportCardBatchService.compileClass(schoolId, classId, sessionId, termId, opts);
  }

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
