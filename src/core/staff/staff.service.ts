import mongoose from 'mongoose';
import { Staff } from '../../models/Staff';
import { User } from '../../models/User';
import { Subject } from '../../models/Subject';
import { Class } from '../../models/Class';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { Notifier } from '../../services/notifier.service';

// Login roles a staff member can be given. TEACHER/ACCOUNTANT are accepted as
// friendly aliases for the real role names.
const LOGIN_ROLE_ALIASES: Record<string, string> = {
  TEACHER: 'SUBJECT_TEACHER',
  ACCOUNTANT: 'BURSAR',
};
const LOGIN_ROLES = new Set([
  'FORM_TEACHER', 'SUBJECT_TEACHER', 'HEAD_TEACHER', 'BURSAR', 'ADMIN', 'HOSTEL_MANAGER', 'STAFF',
]);

function ids(input: any, label: string): string[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new BadRequestError(`${label} must be an array`);
  const out = [...new Set(input.map((x: any) => String(x)))];
  for (const x of out) if (!mongoose.isValidObjectId(x)) throw new BadRequestError(`${label} contains an invalid id`);
  return out;
}

export class StaffService {
  static async create(data: any) {
    const staff = new Staff(data);
    await staff.save();
    return staff;
  }

  static async getById(id: string, schoolId: string) {
    const staff = await Staff.findOne({ _id: id, schoolId });
    if (!staff) throw new NotFoundError('Staff not found');
    return staff;
  }

  static async getAll(schoolId: string, query: any) {
    const { schoolId: _ignored, ...safeQuery } = query || {};
    return Staff.find({ ...safeQuery, schoolId });
  }

  static async update(id: string, schoolId: string, data: any) {
    delete data.schoolId;
    // Teaching assignment has its own endpoint so it can be validated and synced.
    delete data.subjectIds;
    delete data.classIds;
    delete data.formClassId;
    delete data.userId;
    const staff = await Staff.findOneAndUpdate({ _id: id, schoolId }, data, { new: true });
    if (!staff) throw new NotFoundError('Staff not found');
    return staff;
  }

  static async delete(id: string, schoolId: string) {
    const staff = await Staff.findOneAndDelete({ _id: id, schoolId });
    if (!staff) throw new NotFoundError('Staff not found');
    await User.updateMany({ schoolId, staffId: id }, { $set: { isActive: false } });
    return staff;
  }

  // ------------------------------------------------------------------
  // Teaching assignment: "this teacher takes these subjects in these classes"
  // ------------------------------------------------------------------
  static async getTeaching(id: string, schoolId: string) {
    const staff: any = await Staff.findOne({ _id: id, schoolId })
      .populate('subjectIds', 'name code')
      .populate('classIds', 'name')
      .populate('formClassId', 'name')
      .lean();
    if (!staff) throw new NotFoundError('Staff not found');
    const user: any = await User.findOne({ schoolId, staffId: id }).select('username role isActive').lean();
    return {
      staffId: String(staff._id),
      name: `${staff.firstName} ${staff.lastName}`,
      subjects: (staff.subjectIds || []).map((s: any) => ({ id: String(s._id), name: s.name, code: s.code })),
      classes: (staff.classIds || []).map((c: any) => ({ id: String(c._id), name: c.name })),
      formClass: staff.formClassId ? { id: String(staff.formClassId._id), name: staff.formClassId.name } : null,
      login: user ? { userId: String(user._id), username: user.username, role: user.role, isActive: user.isActive } : null,
    };
  }

  /**
   * Replace the teacher's subjects/classes (and optionally form class), then
   * sync the linked login so what they can see and score updates immediately.
   * Pass only the fields you want to change.
   */
  static async assignTeaching(
    id: string,
    schoolId: string,
    data: { subjectIds?: string[]; classIds?: string[]; formClassId?: string | null; role?: string }
  ) {
    const staff: any = await Staff.findOne({ _id: id, schoolId });
    if (!staff) throw new NotFoundError('Staff not found');

    if (data.subjectIds !== undefined) {
      const subjectIds = ids(data.subjectIds, 'subjectIds');
      const found = await Subject.find({ _id: { $in: subjectIds }, schoolId }).select('_id classIds').lean();
      if (found.length !== subjectIds.length) throw new BadRequestError('One or more subjects do not exist in this school.');
      staff.subjectIds = subjectIds;
    }
    if (data.classIds !== undefined) {
      const classIds = ids(data.classIds, 'classIds');
      const found = await Class.find({ _id: { $in: classIds }, schoolId }).select('_id').lean();
      if (found.length !== classIds.length) throw new BadRequestError('One or more classes do not exist in this school.');
      staff.classIds = classIds;
    }
    if (data.formClassId !== undefined) {
      if (!data.formClassId) {
        staff.formClassId = undefined;
      } else {
        if (!mongoose.isValidObjectId(data.formClassId)) throw new BadRequestError('Invalid formClassId');
        const cls = await Class.findOne({ _id: data.formClassId, schoolId }).select('_id').lean();
        if (!cls) throw new BadRequestError('Form class not found in this school.');
        staff.formClassId = data.formClassId;
      }
    }
    await staff.save();

    // Make the subject list on each chosen class include the teacher's classes.
    // (A subject with no classIds already applies to every class, so leave those alone.)
    const subjectIds = (staff.subjectIds || []).map(String);
    const classIds = (staff.classIds || []).map(String);
    if (subjectIds.length && classIds.length) {
      await Subject.updateMany(
        { _id: { $in: subjectIds }, schoolId, 'classIds.0': { $exists: true } },
        { $addToSet: { classIds: { $each: classIds } } }
      );
    }
    // Class record points at its form teacher.
    if (data.formClassId) {
      await Class.updateOne({ _id: data.formClassId, schoolId }, { $set: { homeroomTeacher: staff._id } });
    }

    // Sync the linked login.
    const user: any = await User.findOne({ schoolId, staffId: staff._id });
    if (user) {
      const update: any = { subjectIds: staff.subjectIds };
      if (data.formClassId !== undefined) update.formClassId = staff.formClassId || undefined;
      if (data.role) {
        const role = LOGIN_ROLE_ALIASES[data.role] || data.role;
        if (!['FORM_TEACHER', 'SUBJECT_TEACHER'].includes(role)) throw new BadRequestError('role must be FORM_TEACHER or SUBJECT_TEACHER');
        update.role = role;
      } else if (staff.formClassId && user.role === 'SUBJECT_TEACHER' && !data.role) {
        // A teacher who is given a form class becomes a form teacher.
        update.role = 'FORM_TEACHER';
      }
      if (update.role === 'FORM_TEACHER' && !(update.formClassId || user.formClassId)) {
        throw new BadRequestError('A form teacher needs a form class (formClassId).');
      }
      const unset: any = {};
      if (update.formClassId === undefined && data.formClassId !== undefined) { delete update.formClassId; unset.formClassId = 1; }
      await User.updateOne({ _id: user._id }, { $set: update, ...(Object.keys(unset).length ? { $unset: unset } : {}) });
      void Notifier.users(schoolId, [user._id], 'Teaching assignment updated', 'Your subjects or classes were updated by the school.', { kind: 'TEACHING_ASSIGNMENT' });
    }

    return StaffService.getTeaching(id, schoolId);
  }

  static async createLogin(
    staffId: string,
    schoolId: string,
    data: { username: string; password: string; role: string; subjectIds?: string[]; formClassId?: string }
  ) {
    const staff: any = await Staff.findOne({ _id: staffId, schoolId });
    if (!staff) throw new NotFoundError('Staff member not found');

    if (!data.username || data.username.trim().length < 3) {
      throw new BadRequestError('Username must be at least 3 characters');
    }
    if (!data.password || data.password.length < 6) {
      throw new BadRequestError('Password must be at least 6 characters');
    }

    const role = LOGIN_ROLE_ALIASES[data.role] || data.role;
    if (!LOGIN_ROLES.has(role)) {
      throw new BadRequestError(`Role must be one of: ${[...LOGIN_ROLES, ...Object.keys(LOGIN_ROLE_ALIASES)].join(', ')}`);
    }

    const username = data.username.trim().toLowerCase();
    const existing = await User.findOne({ username });
    if (existing) throw new BadRequestError('Username already taken');

    const existingByEmail = await User.findOne({ schoolId, email: staff.email });
    if (existingByEmail) {
      throw new BadRequestError(
        `A login already exists for ${staff.email}. Use that account or contact support.`
      );
    }
    const alreadyLinked = await User.findOne({ schoolId, staffId: staff._id });
    if (alreadyLinked) throw new BadRequestError('This staff member already has a login.');

    // Teaching staff: use what was sent, else what was already assigned on the staff record.
    const subjectIds = data.subjectIds !== undefined ? ids(data.subjectIds, 'subjectIds') : (staff.subjectIds || []).map(String);
    const formClassId = data.formClassId || (staff.formClassId ? String(staff.formClassId) : undefined);

    if (role === 'FORM_TEACHER' && !formClassId) {
      throw new BadRequestError('A form teacher needs a form class. Assign one first (PUT /staff/:id/teaching) or send formClassId.');
    }
    if (role === 'SUBJECT_TEACHER' && subjectIds.length === 0) {
      throw new BadRequestError('A subject teacher needs at least one subject. Assign subjects first (PUT /staff/:id/teaching) or send subjectIds.');
    }

    const user = new User({
      email: staff.email,
      username,
      password: data.password,
      name: `${staff.firstName} ${staff.lastName}`.trim(),
      firstName: staff.firstName,
      lastName: staff.lastName,
      phone: staff.phone,
      role,
      schoolId,
      staffId: staff._id,
      subjectIds: ['FORM_TEACHER', 'SUBJECT_TEACHER'].includes(role) ? subjectIds : [],
      formClassId: role === 'FORM_TEACHER' ? formClassId : undefined,
      isActive: true,
    });
    await user.save();

    staff.userId = user._id;
    await staff.save();

    return {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
    };
  }
}
