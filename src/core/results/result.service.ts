import { Result } from '../../models/Result';
import { NotFoundError } from '../../utils/errors';

export class ResultService {
  // Upsert on the (student, subject, term, session) tuple so a teacher can
  // correct a score by re-submitting. Previously this threw
  // 'Result already exists' which made score correction impossible.
  static async create(data: any) {
    const existing = await Result.findOne({
      studentId: data.studentId,
      subjectId: data.subjectId,
      termId: data.termId,
      sessionId: data.sessionId,
    });

    if (existing) {
      // Update in place — keeps the same _id so references stay valid.
      Object.assign(existing, data);
      await existing.save();
      return existing;
    }

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
    const { schoolId: _ignored, ...safeQuery } = query || {};
    return Result.find({ ...safeQuery, schoolId }).populate('subjectId studentId');
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
