import { User } from '../../models/User';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import argon2 from 'argon2';

export class UserService {
  static async create(data: any) {
    const existing = await User.findOne({ email: data.email });
    if (existing) throw new BadRequestError('Email already in use');
    const user = new User(data);
    await user.save();
    return user;
  }

  static async getById(id: string) {
    const user = await User.findById(id).select('-password -refreshTokens');
    if (!user) throw new NotFoundError('User not found');
    return user;
  }

  static async getAll(query: any) {
    return User.find(query).select('-password -refreshTokens');
  }

  static async update(id: string, data: any) {
    if (data.password) {
      data.password = await argon2.hash(data.password);
    }
    const user = await User.findByIdAndUpdate(id, data, { new: true }).select('-password -refreshTokens');
    if (!user) throw new NotFoundError('User not found');
    return user;
  }

  static async delete(id: string) {
    const user = await User.findByIdAndDelete(id);
    if (!user) throw new NotFoundError('User not found');
    return user;
  }
}
