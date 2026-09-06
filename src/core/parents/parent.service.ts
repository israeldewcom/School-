import { Parent } from '../../models/Parent';
import { NotFoundError } from '../../utils/errors';

export class ParentService {
  static async create(data: any) {
    const parent = new Parent(data);
    await parent.save();
    return parent;
  }

  static async getById(id: string, schoolId: string) {
    const parent = await Parent.findOne({ _id: id, schoolId }).populate('children');
    if (!parent) throw new NotFoundError('Parent not found');
    return parent;
  }

  static async getAll(schoolId: string, query: any) {
    return Parent.find({ schoolId, ...query }).populate('children');
  }

  static async update(id: string, schoolId: string, data: any) {
    const parent = await Parent.findOneAndUpdate({ _id: id, schoolId }, data, { new: true });
    if (!parent) throw new NotFoundError('Parent not found');
    return parent;
  }

  static async delete(id: string, schoolId: string) {
    const parent = await Parent.findOneAndDelete({ _id: id, schoolId });
    if (!parent) throw new NotFoundError('Parent not found');
    return parent;
  }
}
