import { Staff } from '../../models/Staff';
import { NotFoundError } from '../../utils/errors';

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
    return Staff.find({ schoolId, ...query });
  }

  static async update(id: string, schoolId: string, data: any) {
    const staff = await Staff.findOneAndUpdate({ _id: id, schoolId }, data, { new: true });
    if (!staff) throw new NotFoundError('Staff not found');
    return staff;
  }

  static async delete(id: string, schoolId: string) {
    const staff = await Staff.findOneAndDelete({ _id: id, schoolId });
    if (!staff) throw new NotFoundError('Staff not found');
    return staff;
  }
}
