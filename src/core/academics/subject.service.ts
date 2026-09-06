import { Subject } from '../../models/Subject';
import { NotFoundError, BadRequestError } from '../../utils/errors';

export class SubjectService {
  static async create(data: any) {
    const existing = await Subject.findOne({ schoolId: data.schoolId, code: data.code });
    if (existing) throw new BadRequestError('Subject code already exists');
    const subject = new Subject(data);
    await subject.save();
    return subject;
  }

  static async getById(id: string, schoolId: string) {
    const subject = await Subject.findOne({ _id: id, schoolId });
    if (!subject) throw new NotFoundError('Subject not found');
    return subject;
  }

  static async getAll(schoolId: string, query: any) {
    return Subject.find({ schoolId, ...query });
  }

  static async update(id: string, schoolId: string, data: any) {
    const subject = await Subject.findOneAndUpdate({ _id: id, schoolId }, data, { new: true });
    if (!subject) throw new NotFoundError('Subject not found');
    return subject;
  }

  static async delete(id: string, schoolId: string) {
    const subject = await Subject.findOneAndDelete({ _id: id, schoolId });
    if (!subject) throw new NotFoundError('Subject not found');
    return subject;
  }
}
