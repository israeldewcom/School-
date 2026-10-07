// src/core/accounts/portalAccount.service.ts
//
// Creates the student and parent portal logins automatically.
//
//   Student  -> username = admission number, first password = admission number
//   Parent   -> username = phone number,     first password = phone number
//
// Passwords are hashed by the User model (argon2) like any other user, and
// users can change them at any time with POST /auth/change-password.
//
// Every function here is idempotent: calling it twice never creates a second
// login, and it never touches the password of an account that already exists
// (so a password the user has changed is never reset).
import mongoose from 'mongoose';
import { User } from '../../models/User';
import { Parent } from '../../models/Parent';
import { Student } from '../../models/Student';
import logger from '../../config/logger';

export interface ProvisionResult {
  user: any | null;
  username: string;
  /** The initial password, only when the account was created just now. */
  password: string | null;
  isNew: boolean;
}

/** Student username: the admission number, lower-cased, spaces removed. */
export function studentUsername(admissionNumber: string): string {
  return String(admissionNumber || '').replace(/\s+/g, '').toLowerCase();
}

/** Parent username: the phone number with spaces, dashes and brackets removed. */
export function parentUsername(phone: string): string {
  return String(phone || '').replace(/[^\d+]/g, '');
}

function placeholderEmail(username: string, schoolId: string): string {
  const safe = username.replace(/[^a-z0-9._-]/g, '');
  return `${safe}.${Date.now().toString(36)}@${String(schoolId).slice(-6)}.local`;
}

export class PortalAccountService {
  // ------------------------------------------------------------------
  // Student
  // ------------------------------------------------------------------
  static async ensureStudentUser(schoolId: string, student: any): Promise<ProvisionResult> {
    const studentId = student._id;
    const admission = String(student.admissionNumber || '').trim();
    const username = studentUsername(admission);

    const existing = await User.findOne({ schoolId, role: 'STUDENT', studentId });
    if (existing) {
      return { user: existing, username: existing.username, password: null, isNew: false };
    }
    if (!username) {
      logger.warn(`portal: student ${studentId} has no admission number; no login created`);
      return { user: null, username: '', password: null, isNew: false };
    }

    const name =
      student.fullName || `${student.firstName || ''} ${student.lastName || ''}`.trim() || username;

    try {
      const user = await User.create({
        schoolId,
        username,
        password: admission, // first-time password = admission number (hashed on save)
        role: 'STUDENT',
        studentId,
        name,
        email: placeholderEmail(username, schoolId),
        avatar: student.photo || undefined,
        isActive: true,
      });
      return { user, username, password: admission, isNew: true };
    } catch (err: any) {
      if (err?.code === 11000) {
        // Either a concurrent request just created it, or the username is
        // used by someone else in this school.
        const again = await User.findOne({ schoolId, role: 'STUDENT', studentId });
        if (again) return { user: again, username: again.username, password: null, isNew: false };
        logger.warn(`portal: username "${username}" already in use in school ${schoolId}; student ${studentId} has no login`);
        return { user: null, username, password: null, isNew: false };
      }
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // Parent
  // ------------------------------------------------------------------
  static async ensureParentUser(schoolId: string, parent: any): Promise<ProvisionResult> {
    const parentId = parent._id;
    const phone = String(parent.phone || '').trim();
    const username = parentUsername(phone);

    const existing = await User.findOne({ schoolId, role: 'PARENT', parentId });
    if (existing) {
      return { user: existing, username: existing.username, password: null, isNew: false };
    }
    if (!username) {
      logger.warn(`portal: parent ${parentId} has no phone number; no login created`);
      return { user: null, username: '', password: null, isNew: false };
    }

    const name =
      parent.fullName || `${parent.firstName || ''} ${parent.lastName || ''}`.trim() || username;

    // Use the parent's real email only if no other login in this school has it.
    let email = placeholderEmail(username, schoolId);
    if (parent.email) {
      const taken = await User.exists({ schoolId, email: String(parent.email).toLowerCase() });
      if (!taken) email = String(parent.email).toLowerCase();
    }

    try {
      const user = await User.create({
        schoolId,
        username,
        password: username, // first-time password = phone number (hashed on save)
        role: 'PARENT',
        parentId,
        name,
        email,
        phone,
        isActive: true,
      });
      return { user, username, password: username, isNew: true };
    } catch (err: any) {
      if (err?.code === 11000) {
        const again = await User.findOne({ schoolId, role: 'PARENT', parentId });
        if (again) return { user: again, username: again.username, password: null, isNew: false };
        logger.warn(`portal: phone "${username}" already has a login in school ${schoolId}; parent ${parentId} has none`);
        return { user: null, username, password: null, isNew: false };
      }
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // Convenience: everything a newly saved student needs
  // ------------------------------------------------------------------
  /**
   * Create the student's login and a login for each linked parent.
   * Never throws: a problem here must not stop a student from being saved.
   */
  static async provisionForStudent(schoolId: string, student: any) {
    const out: { student: ProvisionResult | null; parents: ProvisionResult[] } = {
      student: null,
      parents: [],
    };
    try {
      out.student = await PortalAccountService.ensureStudentUser(schoolId, student);
    } catch (err: any) {
      logger.warn(`portal: student login failed for ${student?._id}: ${err?.message}`);
    }
    out.parents = await PortalAccountService.provisionParents(schoolId, student?.parentIds || []);
    return out;
  }

  /** Create logins for these parent ids. Never throws. */
  static async provisionParents(schoolId: string, parentIds: any[]) {
    const results: ProvisionResult[] = [];
    const ids = (parentIds || [])
      .map((p: any) => (p && p._id ? String(p._id) : String(p)))
      .filter((p) => mongoose.isValidObjectId(p));
    if (ids.length === 0) return results;

    const parents = await Parent.find({ _id: { $in: ids }, schoolId });
    for (const parent of parents) {
      try {
        results.push(await PortalAccountService.ensureParentUser(schoolId, parent));
      } catch (err: any) {
        logger.warn(`portal: parent login failed for ${parent._id}: ${err?.message}`);
      }
    }
    return results;
  }

  // ------------------------------------------------------------------
  // Keep usernames in step when the admission number / phone is corrected
  // ------------------------------------------------------------------
  /**
   * If an admin fixes a typo in the admission number, move the login to the
   * new number. The password is left alone (the user may have changed it).
   */
  static async syncStudentUsername(schoolId: string, studentId: string, newAdmission: string) {
    try {
      const user = await User.findOne({ schoolId, role: 'STUDENT', studentId });
      const next = studentUsername(newAdmission);
      if (!user || !next || user.username === next) return;
      const clash = await User.exists({ schoolId, username: next, _id: { $ne: user._id } });
      if (clash) {
        logger.warn(`portal: cannot rename login to "${next}" in school ${schoolId}; already in use`);
        return;
      }
      user.username = next;
      await user.save();
    } catch (err: any) {
      logger.warn(`portal: username sync failed for student ${studentId}: ${err?.message}`);
    }
  }

  static async syncParentUsername(schoolId: string, parentId: string, newPhone: string) {
    try {
      const user = await User.findOne({ schoolId, role: 'PARENT', parentId });
      const next = parentUsername(newPhone);
      if (!user || !next) return;
      user.phone = String(newPhone).trim();
      if (user.username !== next) {
        const clash = await User.exists({ schoolId, username: next, _id: { $ne: user._id } });
        if (clash) {
          logger.warn(`portal: cannot rename login to "${next}" in school ${schoolId}; already in use`);
        } else {
          user.username = next;
        }
      }
      await user.save();
    } catch (err: any) {
      logger.warn(`portal: username sync failed for parent ${parentId}: ${err?.message}`);
    }
  }

  // ------------------------------------------------------------------
  // One-off: give every EXISTING student / parent a login (used by the
  // backfill script). Returns counts.
  // ------------------------------------------------------------------
  static async backfillSchool(schoolId: string) {
    let studentsCreated = 0;
    let parentsCreated = 0;
    let skipped = 0;

    const students = await Student.find({ schoolId, status: { $ne: 'DELETED' } });
    for (const s of students) {
      try {
        const r = await PortalAccountService.ensureStudentUser(schoolId, s);
        if (r.isNew) studentsCreated++;
        else if (!r.user) skipped++;
      } catch (err: any) {
        skipped++;
        logger.warn(`backfill: student ${s._id}: ${err?.message}`);
      }
    }

    const parents = await Parent.find({ schoolId });
    for (const p of parents) {
      try {
        const r = await PortalAccountService.ensureParentUser(schoolId, p);
        if (r.isNew) parentsCreated++;
        else if (!r.user) skipped++;
      } catch (err: any) {
        skipped++;
        logger.warn(`backfill: parent ${p._id}: ${err?.message}`);
      }
    }
    return { studentsCreated, parentsCreated, skipped };
  }
}
