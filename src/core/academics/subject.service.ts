import { Subject } from '../../models/Subject';
import { NotFoundError, BadRequestError } from '../../utils/errors';

export class SubjectService {
  static async create(data: any) {
    if (!data.code || String(data.code).trim() === '') {
      data.code = SubjectService.generateCode(data.name);
    }

    const existing = await Subject.findOne({
      schoolId: data.schoolId,
      code: data.code,
    });
    if (existing) throw new BadRequestError('Subject code already exists');

    const subject = new Subject(data);
    await subject.save();
    return subject;
  }

  private static generateCode(name: string): string {
    const cleaned = String(name || '').replace(/[^a-zA-Z0-9 ]/g, '').trim();
    if (!cleaned) return `SUB${Date.now().toString(36).toUpperCase()}`;
    const parts = cleaned.split(/\s+/);
    if (parts.length === 1) {
      const prefix = parts[0].substring(0, 3).toUpperCase();
      return `${prefix}${Math.floor(100 + Math.random() * 900)}`;
    }
    const acronym = parts.map((p) => p[0]).join('').toUpperCase();
    return `${acronym}${Math.floor(10 + Math.random() * 90)}`;
  }

  static async getById(id: string, schoolId: string) {
    const subject = await Subject.findOne({ _id: id, schoolId });
    if (!subject) throw new NotFoundError('Subject not found');
    return subject;
  }

  static async getAll(schoolId: string, query: any) {
    const { schoolId: _ignored, ...safeQuery } = query || {};
    return Subject.find({ ...safeQuery, schoolId });
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
