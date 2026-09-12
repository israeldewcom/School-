import { Staff } from '../../models/Staff';
import { User } from '../../models/User';
import { NotFoundError, BadRequestError } from '../../utils/errors';

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
    const staff = await Staff.findOneAndUpdate({ _id: id, schoolId }, data, { new: true });
    if (!staff) throw new NotFoundError('Staff not found');
    return staff;
  }

  static async delete(id: string, schoolId: string) {
    const staff = await Staff.findOneAndDelete({ _id: id, schoolId });
    if (!staff) throw new NotFoundError('Staff not found');
    return staff;
  }

  static async createLogin(
    staffId: string,
    schoolId: string,
    data: { username: string; password: string; role: string }
  ) {
    const staff = await Staff.findOne({ _id: staffId, schoolId });
    if (!staff) throw new NotFoundError('Staff member not found');

    if (!data.username || data.username.trim().length < 3) {
      throw new BadRequestError('Username must be at least 3 characters');
    }
    if (!data.password || data.password.length < 6) {
      throw new BadRequestError('Password must be at least 6 characters');
    }

    const allowedRoles = ['TEACHER', 'BURSAR', 'ADMIN', 'STAFF'];
    if (!allowedRoles.includes(data.role)) {
      throw new BadRequestError(`Role must be one of: ${allowedRoles.join(', ')}`);
    }

    const existing = await User.findOne({ username: data.username.trim() });
    if (existing) throw new BadRequestError('Username already taken');

    const existingByEmail = await User.findOne({ email: staff.email });
    if (existingByEmail) {
      throw new BadRequestError(
        `A login already exists for ${staff.email}. Use that account or contact support.`
      );
    }

    const user = new User({
      email: staff.email,
      username: data.username.trim(),
      password: data.password,
      firstName: staff.firstName,
      lastName: staff.lastName,
      role: data.role,
      schoolId,
      isActive: true,
    });
    await user.save();

    return {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
    };
  }
}
