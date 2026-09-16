// src/core/users/user.service.ts
import mongoose from 'mongoose';
import { User } from '../../models/User';
import { Staff } from '../../models/Staff';
import { Parent } from '../../models/Parent';
import { Class } from '../../models/Class';
import { Subject } from '../../models/Subject';
import { AuditLog } from '../../models/AuditLog';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';
import logger from '../../config/logger';

const CREATABLE_ROLES = [
  'ADMIN',
  'HEAD_TEACHER',
  'FORM_TEACHER',
  'SUBJECT_TEACHER',
  'BURSAR',
  'PARENT',
  'STAFF',
];

export class UserService {
  static async list(schoolId: string, query: any = {}) {
    const filter: any = { schoolId };
    if (query.role) filter.role = query.role;
    if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';

    const users = await User.find(filter)
      .populate('staffId', 'firstName lastName')
      .populate('parentId', 'firstName lastName phone')
      .populate('formClassId', 'name')
      .populate('subjectIds', 'name')
      .sort({ createdAt: -1 })
      .lean();

    return users.map((u: any) => ({
      id: String(u._id),
      username: u.username,
      name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
      email: u.email,
      phone: u.phone,
      role: u.role,
      isActive: u.isActive,
      staffId: u.staffId?._id ? String(u.staffId._id) : null,
      staffName: u.staffId
        ? `${u.staffId.firstName || ''} ${u.staffId.lastName || ''}`.trim()
        : null,
      parentId: u.parentId?._id ? String(u.parentId._id) : null,
      parentName: u.parentId
        ? `${u.parentId.firstName || ''} ${u.parentId.lastName || ''}`.trim()
        : null,
      formClassId: u.formClassId?._id ? String(u.formClassId._id) : null,
      formClassName: u.formClassId?.name || null,
      subjectIds: (u.subjectIds || []).map((s: any) => ({
        id: String(s._id),
        name: s.name,
      })),
      lastLoginAt: u.lastLoginAt || u.lastLogin,
      createdAt: u.createdAt,
    }));
  }

  static async create(schoolId: string, createdBy: string, data: any) {
    if (!data?.username || String(data.username).trim().length < 3) {
      throw new BadRequestError('Username must be at least 3 characters');
    }
    if (!data?.password || String(data.password).length < 6) {
      throw new BadRequestError('Password must be at least 6 characters');
    }
    if (!data?.name || !String(data.name).trim()) {
      throw new BadRequestError('Display name is required');
    }
    if (!data?.role || !CREATABLE_ROLES.includes(data.role)) {
      throw new BadRequestError(`Role must be one of: ${CREATABLE_ROLES.join(', ')}`);
    }

    const username = String(data.username).toLowerCase().trim();
    const existing = await User.findOne({ schoolId, username });
    if (existing) throw new BadRequestError('That username is already taken in this school.');

    const nameParts = String(data.name).trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Always set a unique email. When the caller doesn't provide one,
    // build a deterministic placeholder so the unique index never sees
    // two nulls. This fixes "A record with that email already exists".
    const providedEmail = data.email && String(data.email).trim();
    const email = providedEmail
      ? String(providedEmail).toLowerCase()
      : `${username}.${Date.now().toString(36)}@${String(schoolId).slice(-6)}.local`;

    // Guard against a duplicate provided email.
    if (providedEmail) {
      const dup = await User.findOne({ schoolId, email: email.toLowerCase() });
      if (dup) throw new BadRequestError('A user with that email already exists in this school.');
    }

    const payload: any = {
      schoolId,
      username,
      password: data.password,
      name: String(data.name).trim(),
      firstName,
      lastName,
      email,
      phone: data.phone ? String(data.phone).trim() : undefined,
      role: data.role,
      isActive: true,
      refreshTokens: [],
    };

    switch (data.role) {
      case 'FORM_TEACHER': {
        if (!data.formClassId || !mongoose.isValidObjectId(data.formClassId)) {
          throw new BadRequestError('A form teacher must be assigned to a class.');
        }
        const cls = await Class.findOne({ _id: data.formClassId, schoolId });
        if (!cls) throw new BadRequestError('Class not found.');
        payload.formClassId = data.formClassId;
        break;
      }
      case 'SUBJECT_TEACHER': {
        const subjectIds = Array.isArray(data.subjectIds)
          ? data.subjectIds.filter((s: any) => mongoose.isValidObjectId(s))
          : [];
        if (subjectIds.length === 0) {
          throw new BadRequestError('A subject teacher must be assigned at least one subject.');
        }
        const found = await Subject.find({ _id: { $in: subjectIds }, schoolId })
          .select('_id')
          .lean();
        if (found.length !== subjectIds.length) {
          throw new BadRequestError('One or more subjects do not belong to this school.');
        }
        payload.subjectIds = subjectIds;
        break;
      }
      case 'PARENT': {
        if (!data.parentId || !mongoose.isValidObjectId(data.parentId)) {
          throw new BadRequestError('A parent login must be linked to a parent record.');
        }
        const parent = await Parent.findOne({ _id: data.parentId, schoolId });
        if (!parent) throw new BadRequestError('Parent record not found.');
        payload.parentId = data.parentId;
        break;
      }
      case 'BURSAR':
      case 'ADMIN':
      case 'HEAD_TEACHER':
      case 'STAFF': {
        if (data.staffId && mongoose.isValidObjectId(data.staffId)) {
          const staff = await Staff.findOne({ _id: data.staffId, schoolId });
          if (!staff) throw new BadRequestError('Staff record not found.');
          payload.staffId = data.staffId;
        }
        break;
      }
    }

    const user = new User(payload);
    await user.save();

    try {
      await AuditLog.create({
        actor: createdBy,
        action: 'user.created',
        resource: 'User',
        resourceId: user._id,
        after: { username, role: data.role },
      });
    } catch (_) {}

    logger.info(`User created: ${username} (${data.role}) by ${createdBy}`, { schoolId });
    return User.findById(user._id).select('-password').lean();
  }

  static async update(schoolId: string, actorId: string, id: string, data: any) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid user id');
    const user = await User.findOne({ _id: id, schoolId });
    if (!user) throw new NotFoundError('User not found');

    if (String(user._id) === String(actorId) && data.role && data.role !== user.role) {
      throw new BadRequestError('You cannot change your own role.');
    }
    if (['SCHOOL_OWNER', 'SUPER_ADMIN'].includes(user.role)) {
      throw new BadRequestError('This account cannot be modified.');
    }

    if (data.name !== undefined) {
      user.name = String(data.name).trim();
      const parts = user.name.split(/\s+/);
      user.firstName = parts[0] || '';
      user.lastName = parts.slice(1).join(' ') || '';
    }
    if (data.email !== undefined) {
      if (data.email) {
        const lower = String(data.email).toLowerCase().trim();
        const dup = await User.findOne({ schoolId, email: lower, _id: { $ne: id } });
        if (dup) throw new BadRequestError('That email is already used by another user.');
        user.email = lower;
      } else {
        // Never leave email null — regenerate the placeholder.
        user.email = `${user.username}.${Date.now().toString(36)}@${String(schoolId).slice(-6)}.local`;
      }
    }
    if (data.phone !== undefined) user.phone = data.phone ? String(data.phone).trim() : undefined;
    if (data.isActive !== undefined) user.isActive = !!data.isActive;

    if (data.role && data.role !== user.role) {
      if (!CREATABLE_ROLES.includes(data.role)) {
        throw new BadRequestError(`Role must be one of: ${CREATABLE_ROLES.join(', ')}`);
      }
      user.set('formClassId', undefined);
      user.set('subjectIds', []);
      user.set('parentId', undefined);
      user.role = data.role;
    }

    if (data.formClassId !== undefined) {
      if (!mongoose.isValidObjectId(data.formClassId)) throw new BadRequestError('Invalid class id');
      const cls = await Class.findOne({ _id: data.formClassId, schoolId });
      if (!cls) throw new BadRequestError('Class not found');
      user.formClassId = data.formClassId;
    }

    if (data.subjectIds !== undefined) {
      const ids = Array.isArray(data.subjectIds)
        ? data.subjectIds.filter((s: any) => mongoose.isValidObjectId(s))
        : [];
      const found = await Subject.find({ _id: { $in: ids }, schoolId }).select('_id').lean();
      if (found.length !== ids.length) throw new BadRequestError('One or more subjects invalid');
      user.subjectIds = ids;
    }

    if (data.password && String(data.password).length >= 6) {
      user.password = String(data.password);
    }

    await user.save();
    return User.findById(user._id).select('-password').lean();
  }

  static async delete(schoolId: string, actorId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid user id');
    if (String(id) === String(actorId)) {
      throw new BadRequestError('You cannot delete your own account.');
    }
    const user = await User.findOne({ _id: id, schoolId });
    if (!user) throw new NotFoundError('User not found');
    if (['SCHOOL_OWNER', 'SUPER_ADMIN'].includes(user.role)) {
      throw new BadRequestError('This account cannot be deleted.');
    }
    await User.findByIdAndDelete(id);
    logger.info(`User deleted: ${user.username} by ${actorId}`, { schoolId });
    return { deleted: true };
  }

  static async resetPassword(
    schoolId: string,
    actorId: string,
    id: string,
    newPassword: string
  ) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid user id');
    if (!newPassword || String(newPassword).length < 6) {
      throw new BadRequestError('Password must be at least 6 characters');
    }
    const user = await User.findOne({ _id: id, schoolId });
    if (!user) throw new NotFoundError('User not found');
    user.password = String(newPassword);
    user.refreshTokens = [];
    await user.save();

    try {
      await AuditLog.create({
        actor: actorId,
        action: 'user.password_reset',
        resource: 'User',
        resourceId: user._id,
        after: { username: user.username },
      });
    } catch (_) {}

    return { success: true };
  }
}
