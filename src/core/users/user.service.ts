import { User } from '../../models/User';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../utils/errors';
import argon2 from 'argon2';

export class UserService {
  // SUPER_ADMIN may pass a schoolId to scope to a specific tenant.
  // Everyone else is silently scoped to their own schoolId — the passed-in
  // value is ignored so a client can't read another tenant's users.
  static resolveScope(caller: any, requestedSchoolId?: string): string | null {
    if (caller?.role === 'SUPER_ADMIN') {
      return requestedSchoolId || null;
    }
    return caller?.schoolId?.toString() || null;
  }

  static async create(data: any, caller: any) {
    const schoolId = UserService.resolveScope(caller, data.schoolId);
    if (!schoolId) throw new ForbiddenError('Cannot determine school context');

    // Reject attempts to escalate privilege from a non-SUPER_ADMIN caller.
    if (caller?.role !== 'SUPER_ADMIN') {
      const disallowed = ['SUPER_ADMIN'];
      if (disallowed.includes(data.role)) {
        throw new ForbiddenError('Only platform admins can create super admins');
      }
    }

    const existing = await User.findOne({ email: data.email });
    if (existing) throw new BadRequestError('Email already in use');

    const existingUsername = await User.findOne({ username: data.username });
    if (existingUsername) throw new BadRequestError('Username already taken');

    const user = new User({
      ...data,
      schoolId,
      // Only SUPER_ADMIN can override these; strip for everyone else.
      isActive: caller?.role === 'SUPER_ADMIN' ? (data.isActive ?? true) : true,
    });
    await user.save();
    return user;
  }

  static async getById(id: string, caller: any) {
    const schoolId = UserService.resolveScope(caller);
    const query: any = { _id: id };
    if (schoolId) query.schoolId = schoolId;

    const user = await User.findOne(query).select('-password -refreshTokens');
    if (!user) throw new NotFoundError('User not found');
    return user;
  }

  static async getAll(query: any, caller: any) {
    const schoolId = UserService.resolveScope(caller, query?.schoolId);
    const { schoolId: _ignored, ...safeQuery } = query || {};

    const filter: any = { ...safeQuery };
    if (schoolId) filter.schoolId = schoolId;

    return User.find(filter).select('-password -refreshTokens');
  }

  static async update(id: string, data: any, caller: any) {
    const schoolId = UserService.resolveScope(caller);
    const query: any = { _id: id };
    if (schoolId) query.schoolId = schoolId;

    // Non-super-admins cannot change role, schoolId, or isActive.
    const sanitized = { ...data };
    if (caller?.role !== 'SUPER_ADMIN') {
      delete sanitized.role;
      delete sanitized.schoolId;
      delete sanitized.isActive;
    }

    if (sanitized.password) {
      sanitized.password = await argon2.hash(sanitized.password);
    }

    const user = await User.findOneAndUpdate(query, sanitized, { new: true })
      .select('-password -refreshTokens');
    if (!user) throw new NotFoundError('User not found');
    return user;
  }

  static async delete(id: string, caller: any) {
    const schoolId = UserService.resolveScope(caller);
    const query: any = { _id: id };
    if (schoolId) query.schoolId = schoolId;

    const user = await User.findOneAndDelete(query);
    if (!user) throw new NotFoundError('User not found');
    return user;
  }
}
