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
 * Translate the authenticated user into a filter shape. Services call
 * this at the top of any read/write and apply the results.
 *
 * If the request has no schoolId (which would only happen if auth
 * middleware is misconfigured), returns an "empty" scope so services
 * return no data instead of querying across all schools.
 */
export async function getUserScope(req: Request): Promise<UserScope> {
  const authUser: any = (req as any).user || {};
  const role: string = (req as any).userRole || authUser.role || 'STAFF';
  const userId = String((req as any).userId || authUser._id || authUser.id || '');
  const schoolId = String((req as any).schoolId || authUser.schoolId || '');

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

  // Fail closed: if we don't know the school, return no data.
  if (!schoolId) {
    return { ...base, classIds: [], subjectIds: [], ownStudentIds: [] };
  }

  if (role === 'SUPER_ADMIN' || role === 'SCHOOL_OWNER' || role === 'ADMIN') {
    return { ...base, unrestricted: true, restricted: false };
  }

  if (role === 'HEAD_TEACHER') {
    return { ...base, unrestricted: true, restricted: false };
  }

  if (role === 'BURSAR') {
    return { ...base, unrestricted: true, restricted: false };
  }

  if (role === 'FORM_TEACHER') {
    const formClassId = authUser.formClassId;
    return {
      ...base,
      classIds: formClassId ? [String(formClassId)] : [],
      restricted: true,
    };
  }

  if (role === 'SUBJECT_TEACHER') {
    const rawSubjectIds: any[] = authUser.subjectIds || [];
    const subjectIds = rawSubjectIds.map((s) => String(s));
    if (subjectIds.length === 0) {
      return { ...base, classIds: [], subjectIds: [], restricted: true };
    }
    try {
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
    } catch (_) {
      return { ...base, classIds: [], subjectIds, restricted: true };
    }
  }

  if (role === 'PARENT') {
    const parentId = authUser.parentId;
    if (!parentId) {
      return { ...base, ownStudentIds: [], restricted: true };
    }
    try {
      const children = await Student.find({ schoolId, parentIds: parentId })
        .select('_id')
        .lean();
      return {
        ...base,
        ownStudentIds: children.map((c) => String(c._id)),
        restricted: true,
      };
    } catch (_) {
      return { ...base, ownStudentIds: [], restricted: true };
    }
  }

  return { ...base, classIds: [], subjectIds: [], restricted: true };
}

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
    return { _id: { $in: [] } };
  }
  return {};
}

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
