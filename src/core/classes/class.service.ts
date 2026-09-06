import { Class } from '../../models/Class';
import { NotFoundError } from '../../utils/errors';

export class ClassService {
  static async create(data: any) {
    const cls = new Class(data);
    await cls.save();
    return cls;
  }

  static async getById(id: string, schoolId: string) {
    const cls = await Class.findOne({ _id: id, schoolId }).populate('homeroomTeacher students');
    if (!cls) throw new NotFoundError('Class not found');
    return cls;
  }

  static async getAll(schoolId: string, query: any) {
    return Class.find({ schoolId, ...query }).populate('homeroomTeacher');
  }

  static async update(id: string, schoolId: string, data: any) {
    const cls = await Class.findOneAndUpdate({ _id: id, schoolId }, data, { new: true });
    if (!cls) throw new NotFoundError('Class not found');
    return cls;
  }

  static async delete(id: string, schoolId: string) {
    const cls = await Class.findOneAndDelete({ _id: id, schoolId });
    if (!cls) throw new NotFoundError('Class not found');
    return cls;
  }
}
