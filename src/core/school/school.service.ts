import { School } from '../../models/School';
import { AuditLog } from '../../models/AuditLog';
import { NotFoundError } from '../../utils/errors';

export class SchoolService {
  static async create(data: any) {
    const school = new School(data);
    await school.save();
    await AuditLog.create({
      actor: 'system',
      action: 'school.created',
      resource: 'School',
      resourceId: school._id,
      after: data,
    });
    return school;
  }

  static async getById(id: string) {
    const school = await School.findById(id);
    if (!school) throw new NotFoundError('School not found');
    return school;
  }

  static async getAll(query: any) {
    return School.find(query);
  }

  static async update(id: string, data: any) {
    const school = await School.findByIdAndUpdate(id, data, { new: true });
    if (!school) throw new NotFoundError('School not found');
    return school;
  }

  static async delete(id: string) {
    const school = await School.findByIdAndDelete(id);
    if (!school) throw new NotFoundError('School not found');
    return school;
  }
}
