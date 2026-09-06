import { Result } from '../../models/Result';
import { NotFoundError, BadRequestError } from '../../utils/errors';

export class ResultService {
  static async create(data: any) {
    const existing = await Result.findOne({
      studentId: data.studentId,
      subjectId: data.subjectId,
      termId: data.termId,
      sessionId: data.sessionId,
    });
    if (existing) throw new BadRequestError('Result already exists for this subject/term');

    const result = new Result(data);
    await result.save();
    return result;
  }

  static async getById(id: string, schoolId: string) {
    const result = await Result.findOne({ _id: id, schoolId }).populate('subjectId studentId');
    if (!result) throw new NotFoundError('Result not found');
    return result;
  }

  static async getAll(schoolId: string, query: any) {
    return Result.find({ schoolId, ...query }).populate('subjectId studentId');
  }

  static async update(id: string, schoolId: string, data: any) {
    const result = await Result.findOneAndUpdate({ _id: id, schoolId }, data, { new: true });
    if (!result) throw new NotFoundError('Result not found');
    return result;
  }

  static async delete(id: string, schoolId: string) {
    const result = await Result.findOneAndDelete({ _id: id, schoolId });
    if (!result) throw new NotFoundError('Result not found');
    return result;
  }
}
