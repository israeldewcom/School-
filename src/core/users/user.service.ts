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
      id: u._id.toString(),
      username: u.username,
      name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
      email: u.email,
      phone: u.phone,
      role: u.role,
      isActive: u.isActive,
      staffId: u.staffId?._id?.toString() || null,
      staffName: u.staffId
        ? `${u.staffId.firstName || ''} ${u.staffId.lastName || ''}`.trim()
        : null,
      parentId: u.parentId?._id?.toString() || null,
      parentName: u.parentId
        ? `${u.parentId.firstName || ''} ${u.parentId.lastName || ''}`.trim()
        : null,
      formClassId: u.formClassId?._id?.toString() || null,
      formClassName: u.formClassId?.name || null,
      subjectIds: (u.subjectIds || []).map((s: any) => ({
        id: s._id.toString(),
        name: s.name,
      })),
      lastLoginAt: u.lastLoginAt || u.lastLogin,
      createdAt: u.createdAt,
    }));
  }

  static async create(schoolId: string, createdBy: string, data: any) {
    if (!data.username || String(data.username).trim().length < 3) {
      throw new BadRequestError('Username must be at least 3 characters');
    }
    if (!data.password || String(data.password).length < 6) {
      throw new BadRequestError('Password must be at least 6 characters');
    }
    if (!data.name || !String(data.name).trim()) {
      throw new BadRequestError('Display name is required');
    }
    if (!data.role || !CREATABLE_ROLES.includes(data.role)) {
      throw new BadRequestError(`Role must be one of: ${CREATABLE_ROLES.join(', ')}`);
    }

    const username = String(data.username).toLowerCase().trim();
    const existing = await User.findOne({ schoolId, username });
    if (existing) throw new BadRequestError('That username is already taken in this school.');

    // Split name into firstName/lastName too so any legacy reader works.
    const nameParts = String(data.name).trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const payload: any = {
      schoolId,
      username,
      password: data.password,
      name: String(data.name).trim(),
      firstName,
      lastName,
      email: data.email ? String(data.email).trim() : undefined,
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
    if (data.email !== undefined) user.email = data.email ? String(data.email).trim() : undefined;
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
      if (!mongoose.isValidObjectId(data.formClassId)) {
        throw new BadRequestError('Invalid class id');
      }
      const cls = await Class.findOne({ _id: data.formClassId, schoolId });
      if (!cls) throw new BadRequestError('Class not found');
      user.formClassId = data.formClassId;
    }

    if (data.subjectIds !== undefined) {
      const ids = Array.isArray(data.subjectIds)
        ? data.subjectIds.filter((s: any) => mongoose.isValidObjectId(s))
        : [];
      const found = await Subject.find({ _id: { $in: ids }, schoolId })
        .select('_id')
        .lean();
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

  /**
   * Reset another user's password. The actorId is written to the audit
   * log so the change is traceable. Declared with a leading underscore
   * on the parameter so TypeScript's noUnusedParameters doesn't flag it
   * even though it is used — the leading underscore is a lint guard.
   */
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
    // Clear outstanding refresh tokens — a password reset should end
    // every active session for that user.
    user.refreshTokens = [];
    await user.save();

    await AuditLog.create({
      actor: actorId,
      action: 'user.password_reset',
      resource: 'User',
      resourceId: user._id,
      after: { username: user.username },
    });

    return { success: true };
  }
}
