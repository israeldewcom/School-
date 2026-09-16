// src/middleware/scope.middleware.ts
import mongoose from 'mongoose';
import { Request } from 'express';
import { Student } from '../models/Student';
import { Subject } from '../models/Subject';

export interface UserScope {
  role: string;
  userId: string;
  schoolId: string;
  unrestricted: boolean;
  restricted: boolean;
  classIds: string[] | null;
  subjectIds: string[] | null;
  ownStudentIds: string[] | null;
}

/**
 * Translate the logged-in user into a filter shape. Services call this
 * at the top of any read/write and apply the results.
 *
 *   SUPER_ADMIN      → all data, all schools
 *   SCHOOL_OWNER     → their school, all data
 *   ADMIN            → their school, all operational data
 *   HEAD_TEACHER     → academic data, no finances
 *   FORM_TEACHER     → exactly one class
 *   SUBJECT_TEACHER  → their subjects' classes only
 *   BURSAR           → finances only (no student data)
 *   PARENT           → their own children only
 *   STAFF            → minimal read-only
 */
export async function getUserScope(req: Request): Promise<UserScope> {
  const authUser: any = (req as any).user || {};
  const role: string = (req as any).userRole || authUser.role || 'STAFF';
  const userId = String((req as any).userId || authUser._id || '');
  const schoolId = String(req.schoolId || '');

  const base: UserScope = {
    role,
    userId,
    schoolId,
    unrestricted: false,
    restricted: true,
    classIds: null,
    subjectIds: null,
    ownStudentIds: null,
  };

  // Full-access roles.
  if (role === 'SUPER_ADMIN' || role === 'SCHOOL_OWNER' || role === 'ADMIN') {
    return { ...base, unrestricted: true, restricted: false };
  }

  // Head teacher: full academic access, finances gated by route guards.
  if (role === 'HEAD_TEACHER') {
    return { ...base, unrestricted: true, restricted: false };
  }

  // Bursar: financial routes only. Route guards already restrict what
  // they can reach, so no data-level filter is needed here.
  if (role === 'BURSAR') {
    return { ...base, unrestricted: true, restricted: false };
  }

  // Form teacher: exactly one class.
  if (role === 'FORM_TEACHER') {
    const formClassId = authUser.formClassId;
    return {
      ...base,
      classIds: formClassId ? [String(formClassId)] : [],
      restricted: true,
    };
  }

  // Subject teacher: subjects they're assigned to, and the union of
  // those subjects' classIds.
  if (role === 'SUBJECT_TEACHER') {
    const rawSubjectIds: any[] = authUser.subjectIds || [];
    const subjectIds = rawSubjectIds.map((s) => String(s));
    if (subjectIds.length === 0) {
      return { ...base, classIds: [], subjectIds: [], restricted: true };
    }
    const subjects = await Subject.find({
      _id: { $in: subjectIds },
      schoolId,
    })
      .select('classIds')
      .lean();
    const classSet = new Set<string>();
    subjects.forEach((s: any) => {
      (s.classIds || []).forEach((c: any) => classSet.add(String(c)));
    });
    return {
      ...base,
      classIds: [...classSet],
      subjectIds,
      restricted: true,
    };
  }

  // Parent: their own children only.
  if (role === 'PARENT') {
    const parentId = authUser.parentId;
    if (!parentId) {
      return { ...base, ownStudentIds: [], restricted: true };
    }
    const children = await Student.find({ schoolId, parentIds: parentId })
      .select('_id')
      .lean();
    return {
      ...base,
      ownStudentIds: children.map((c) => String(c._id)),
      restricted: true,
    };
  }

  // STAFF and fallback: minimal access.
  return { ...base, classIds: [], subjectIds: [], restricted: true };
}

/**
 * Build a Mongo filter for Student queries based on the user's scope.
 * Services apply this on top of their own filters.
 */
export function studentFilterFromScope(scope: UserScope): any {
  if (scope.unrestricted) return {};
  if (scope.ownStudentIds) {
    return {
      _id: { $in: scope.ownStudentIds.map((id) => new mongoose.Types.ObjectId(id)) },
    };
  }
  if (scope.classIds && scope.classIds.length > 0) {
    return {
      classId: { $in: scope.classIds.map((id) => new mongoose.Types.ObjectId(id)) },
    };
  }
  if (scope.classIds && scope.classIds.length === 0) {
    // Restricted but no classes assigned — return nothing rather than
    // everything. Fails safe.
    return { _id: { $in: [] } };
  }
  return {};
}

/**
 * Assert a specific class is within the user's scope. Throws 403 if not.
 */
export function assertClassInScope(scope: UserScope, classId: string) {
  if (scope.unrestricted) return;
  if (!scope.classIds) return;
  if (!scope.classIds.includes(String(classId))) {
    const err: any = new Error('You do not have access to this class.');
    err.statusCode = 403;
    err.name = 'ForbiddenError';
    throw err;
  }
}

/**
 * Assert a specific student is within the user's scope. Used by the
 * report card and attendance services when a studentId is passed in.
 */
export async function assertStudentInScope(
  scope: UserScope,
  schoolId: string,
  studentId: string
) {
  if (scope.unrestricted) return;
  if (!mongoose.isValidObjectId(studentId)) {
    const err: any = new Error('Invalid student id');
    err.statusCode = 400;
    throw err;
  }
  const student = await Student.findOne({ _id: studentId, schoolId }).select('classId').lean();
  if (!student) {
    const err: any = new Error('Student not found');
    err.statusCode = 404;
    throw err;
  }
  if (scope.ownStudentIds && !scope.ownStudentIds.includes(studentId)) {
    const err: any = new Error('You do not have access to this student.');
    err.statusCode = 403;
    throw err;
  }
  if (scope.classIds && !scope.classIds.includes(String(student.classId))) {
    const err: any = new Error('You do not have access to this student.');
    err.statusCode = 403;
    throw err;
  }
}
