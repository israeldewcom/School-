   // src/core/results/result.service.ts
import mongoose from 'mongoose';
import { Result } from '../../models/Result';
import { Student } from '../../models/Student';
import { Subject } from '../../models/Subject';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { UserScope } from '../../middleware/scope.middleware';

function forbidden(message: string): Error {
  const err: any = new Error(message);
  err.statusCode = 403;
  err.name = 'ForbiddenError';
  return err;
}

function gradeFor(total: number): { grade: string; remark: string } {
  if (total >= 70) return { grade: 'A', remark: 'Excellent' };
  if (total >= 60) return { grade: 'B', remark: 'Very Good' };
  if (total >= 50) return { grade: 'C', remark: 'Good' };
  if (total >= 45) return { grade: 'D', remark: 'Fair' };
  if (total >= 40) return { grade: 'E', remark: 'Pass' };
  return { grade: 'F', remark: 'Fail' };
}

function parseScores(data: any): { ca: number; exam: number } {
  const ca = Number(data?.caScore);
  const exam = Number(data?.examScore);
  if (!Number.isFinite(ca) || ca < 0) {
    throw new BadRequestError('CA score must be a non-negative number');
  }
  if (!Number.isFinite(exam) || exam < 0) {
    throw new BadRequestError('Exam score must be a non-negative number');
  }
  if (ca + exam > 100) {
    throw new BadRequestError('Total score cannot exceed 100');
  }
  return { ca, exam };
}

function requireId(value: any, label: string): string {
  if (!value || !mongoose.isValidObjectId(String(value))) {
    throw new BadRequestError(`${label} is invalid`);
  }
  return String(value);
}

/**
 * Extra Mongo filter that limits which results a caller may see.
 *  - Admin-level roles: everything in the school.
 *  - Parents and students: only their own children's PUBLISHED results.
 *  - Form teachers: their class.
 *  - Subject teachers: their subjects within their classes.
 */
function scopeFilter(scope: UserScope): any {
  if (scope.unrestricted) return {};

  if (scope.ownStudentIds) {
    return { studentId: { $in: scope.ownStudentIds }, published: true };
  }

  const filter: any = { classId: { $in: scope.classIds || [] } };
  if (scope.role === 'SUBJECT_TEACHER') {
    filter.subjectId = { $in: scope.subjectIds || [] };
  }
  return filter;
}

function assertCanScore(scope: UserScope, student: any, subjectId: string) {
  if (scope.unrestricted) return;

  const inClass = (scope.classIds || []).includes(String(student.classId));

  if (scope.role === 'FORM_TEACHER') {
    if (!inClass) throw forbidden('You can only enter results for students in your class.');
    return;
  }

  if (scope.role === 'SUBJECT_TEACHER') {
    if (!inClass) throw forbidden('This student is not in one of your classes.');
    if (!(scope.subjectIds || []).includes(String(subjectId))) {
      throw forbidden('You can only enter results for your own subjects.');
    }
    return;
  }

  throw forbidden('Your role cannot enter results.');
}

export class ResultService {
  // Upsert on the (student, subject, term, session) tuple so a teacher can
  // correct a score by re-submitting. Everything is verified against the
  // caller's school and scope; class, total, grade and remark are computed
  // on the server, never trusted from the request body.
  static async create(schoolId: string, scope: UserScope, data: any) {
    const studentId = requireId(data?.studentId, 'studentId');
    const subjectId = requireId(data?.subjectId, 'subjectId');
    const termId = requireId(data?.termId, 'termId');
    const sessionId = requireId(data?.sessionId, 'sessionId');
    const { ca, exam } = parseScores(data);

    const [student, subject] = await Promise.all([
      Student.findOne({ _id: studentId, schoolId }).select('classId').lean(),
      Subject.findOne({ _id: subjectId, schoolId }).select('_id').lean(),
    ]);
    if (!student) throw new NotFoundError('Student not found');
    if (!subject) throw new NotFoundError('Subject not found');

    assertCanScore(scope, student, subjectId);

    const total = ca + exam;
    const computed = gradeFor(total);
    const customRemark =
      typeof data?.remark === 'string' && data.remark.trim() ? data.remark.trim() : '';

    const key = { schoolId, studentId, subjectId, termId, sessionId };
    const existing = await Result.findOne(key);

    if (existing) {
      if (existing.published && !scope.unrestricted) {
        throw forbidden('These results are already published. Ask an administrator to unpublish them first.');
      }
      existing.classId = student.classId as any;
      existing.caScore = ca;
      existing.examScore = exam;
      existing.total = total;
      existing.grade = computed.grade;
      existing.remark = customRemark || computed.remark;
      await existing.save();
      return existing;
    }

    try {
      return await Result.create({
        ...key,
        classId: student.classId,
        caScore: ca,
        examScore: exam,
        total,
        grade: computed.grade,
        remark: customRemark || computed.remark,
        published: false,
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new BadRequestError('A result for this student and subject already exists. Please retry.');
      }
      throw err;
    }
  }

  // Score a whole class for one subject in a single call.
  static async bulkCreate(schoolId: string, scope: UserScope, data: any) {
    const subjectId = requireId(data?.subjectId, 'subjectId');
    const termId = requireId(data?.termId, 'termId');
    const sessionId = requireId(data?.sessionId, 'sessionId');
    const scores = data?.scores;

    if (!Array.isArray(scores) || scores.length === 0) {
      throw new BadRequestError('scores must be a non-empty array');
    }
    if (scores.length > 500) {
      throw new BadRequestError('A maximum of 500 scores can be submitted at once');
    }

    let allowedStudents: Set<string> | null = null;
    if (data?.classId) {
      const classId = requireId(data.classId, 'classId');
      const inClass = await Student.find({ schoolId, classId }).select('_id').lean();
      allowedStudents = new Set(inClass.map((s: any) => String(s._id)));
    }

    let saved = 0;
    const errors: Array<{ studentId: any; message: string }> = [];

    for (const row of scores) {
      try {
        if (allowedStudents && !allowedStudents.has(String(row?.studentId))) {
          throw new BadRequestError('Student is not in the selected class');
        }
        await ResultService.create(schoolId, scope, {
          studentId: row?.studentId,
          subjectId,
          termId,
          sessionId,
          caScore: row?.caScore,
          examScore: row?.examScore,
          remark: row?.remark,
        });
        saved += 1;
      } catch (err: any) {
        errors.push({ studentId: row?.studentId, message: err?.message || 'Failed' });
      }
    }

    return { saved, failed: errors.length, errors };
  }

  static async getById(id: string, schoolId: string, scope: UserScope) {
    requireId(id, 'Result id');
    const result = await Result.findOne({ _id: id, schoolId, ...scopeFilter(scope) }).populate(
      'subjectId studentId'
    );
    if (!result) throw new NotFoundError('Result not found');
    return result;
  }

  static async getAll(schoolId: string, scope: UserScope, query: any = {}) {
    const filter: any = { schoolId };

    for (const field of ['studentId', 'classId', 'subjectId', 'termId', 'sessionId']) {
      if (query[field]) filter[field] = requireId(query[field], field);
    }
    if (query.published === 'true') filter.published = true;
    if (query.published === 'false') filter.published = false;

    const extra = scopeFilter(scope);

    // Merge scope restrictions with the requested filters (intersection).
    if (extra.studentId) {
      const allowed = (extra.studentId.$in as string[]).map(String);
      if (filter.studentId) {
        if (!allowed.includes(String(filter.studentId))) return [];
      } else {
        filter.studentId = { $in: allowed };
      }
      filter.published = true;
    }
    if (extra.classId) {
      const allowed = (extra.classId.$in as string[]).map(String);
      if (filter.classId) {
        if (!allowed.includes(String(filter.classId))) return [];
      } else {
        filter.classId = { $in: allowed };
      }
    }
    if (extra.subjectId) {
      const allowed = (extra.subjectId.$in as string[]).map(String);
      if (filter.subjectId) {
        if (!allowed.includes(String(filter.subjectId))) return [];
      } else {
        filter.subjectId = { $in: allowed };
      }
    }

    return Result.find(filter)
      .sort({ createdAt: -1 })
      .limit(2000)
      .populate('subjectId studentId');
  }

  static async update(id: string, schoolId: string, scope: UserScope, data: any) {
    requireId(id, 'Result id');
    const existing = await Result.findOne({ _id: id, schoolId, ...scopeFilter(scope) });
    if (!existing) throw new NotFoundError('Result not found');

    if (existing.published && !scope.unrestricted) {
      throw forbidden('These results are already published. Ask an administrator to unpublish them first.');
    }

    const { ca, exam } = parseScores({
      caScore: data?.caScore !== undefined ? data.caScore : existing.caScore,
      examScore: data?.examScore !== undefined ? data.examScore : existing.examScore,
    });

    const total = ca + exam;
    const computed = gradeFor(total);
    const customRemark =
      typeof data?.remark === 'string' && data.remark.trim() ? data.remark.trim() : '';

    existing.caScore = ca;
    existing.examScore = exam;
    existing.total = total;
    existing.grade = computed.grade;
    existing.remark = customRemark || computed.remark;
    await existing.save();
    return existing;
  }

  static async delete(id: string, schoolId: string) {
    requireId(id, 'Result id');
    const result = await Result.findOneAndDelete({ _id: id, schoolId });
    if (!result) throw new NotFoundError('Result not found');
    return result;
  }

  // Publish or unpublish results for a term. Form teachers may publish
  // their own class; only administrators may unpublish.
  static async setPublished(
    schoolId: string,
    scope: UserScope,
    userId: string,
    data: any,
    publish: boolean
  ) {
    const termId = requireId(data?.termId, 'termId');
    const sessionId = requireId(data?.sessionId, 'sessionId');

    const filter: any = { schoolId, termId, sessionId };
    if (data?.classId) filter.classId = requireId(data.classId, 'classId');
    if (data?.subjectId) filter.subjectId = requireId(data.subjectId, 'subjectId');
    if (data?.studentId) filter.studentId = requireId(data.studentId, 'studentId');

    if (!scope.unrestricted) {
      if (!publish) throw forbidden('Only an administrator can unpublish results.');
      if (scope.role !== 'FORM_TEACHER') {
        throw forbidden('Your role cannot publish results.');
      }
      if (!filter.classId || !(scope.classIds || []).includes(String(filter.classId))) {
        throw forbidden('You can only publish results for your own class.');
      }
    }

    const update = publish
      ? { $set: { published: true, publishedAt: new Date(), publishedBy: userId } }
      : { $set: { published: false }, $unset: { publishedAt: '', publishedBy: '' } };

    const res = await Result.updateMany(filter, update);
    return { matched: res.matchedCount, modified: res.modifiedCount, published: publish };
  }
}
