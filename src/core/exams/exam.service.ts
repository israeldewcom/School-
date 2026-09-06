import { Exam } from '../../models/Exam';
import { NotFoundError } from '../../utils/errors';

export class ExamService {
  static async create(data: any) {
    const exam = new Exam(data);
    await exam.save();
    return exam;
  }

  static async getById(id: string, schoolId: string) {
    const exam = await Exam.findOne({ _id: id, schoolId }).populate('subjectId classId');
    if (!exam) throw new NotFoundError('Exam not found');
    return exam;
  }

  static async getAll(schoolId: string, query: any) {
    return Exam.find({ schoolId, ...query }).populate('subjectId classId');
  }

  static async update(id: string, schoolId: string, data: any) {
    const exam = await Exam.findOneAndUpdate({ _id: id, schoolId }, data, { new: true });
    if (!exam) throw new NotFoundError('Exam not found');
    return exam;
  }

  static async delete(id: string, schoolId: string) {
    const exam = await Exam.findOneAndDelete({ _id: id, schoolId });
    if (!exam) throw new NotFoundError('Exam not found');
    return exam;
  }
}
