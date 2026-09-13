import mongoose from 'mongoose';
import { Exam } from '../../models/Exam';
import { Class } from '../../models/Class';
import { Subject } from '../../models/Subject';
import { Session } from '../../models/Session';
import { Term } from '../../models/Term';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';

export class ExamService {
  static async list(schoolId: string, query: any = {}) {
    const filter: any = { schoolId };
    if (query.classId && mongoose.isValidObjectId(query.classId)) filter.classId = query.classId;
    if (query.sessionId && mongoose.isValidObjectId(query.sessionId)) filter.sessionId = query.sessionId;
    if (query.termId && mongoose.isValidObjectId(query.termId)) filter.termId = query.termId;

    const exams = await Exam.find(filter)
      .populate('classId', 'name')
      .populate('subjectId', 'name code')
      .sort({ date: -1 })
      .lean();

    return exams.map((e: any) => ({
      id: e._id?.toString() || e.id,
      name: e.name,
      classId: e.classId?._id?.toString() || e.classId,
      className: e.classId?.name || '—',
      subjectId: e.subjectId?._id?.toString() || e.subjectId,
      subjectName: e.subjectName || e.subjectId?.name || '—',
      maxScore: e.maxScore,
      date: e.date,
      sessionId: e.sessionId,
      termId: e.termId,
    }));
  }

  // Was throwing a generic 500 because subjectId validation happened
  // inside Mongoose. Now every field is checked up front and throws
  // a BadRequestError that the middleware maps to HTTP 400.
  static async create(schoolId: string, data: any) {
    if (!data?.name || !String(data.name).trim()) {
      throw new BadRequestError('Exam name is required.');
    }
    if (!data?.classId || !mongoose.isValidObjectId(data.classId)) {
      throw new BadRequestError('A valid class is required.');
    }
    if (!data?.subjectId || !mongoose.isValidObjectId(data.subjectId)) {
      throw new BadRequestError(
        'A subject is required. Create one in Score Entry → Add subject first.'
      );
    }

    const maxScore = Number(data.maxScore);
    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      throw new BadRequestError('Max score must be a positive number.');
    }

    if (!data?.sessionId || !mongoose.isValidObjectId(data.sessionId)) {
      throw new BadRequestError('Academic session is required.');
    }
    if (!data?.termId || !mongoose.isValidObjectId(data.termId)) {
      throw new BadRequestError('Academic term is required.');
    }

    // Confirm referenced documents exist and belong to this school.
    const [cls, subject, session, term] = await Promise.all([
      Class.findOne({ _id: data.classId, schoolId }),
      Subject.findOne({ _id: data.subjectId, schoolId }),
      Session.findOne({ _id: data.sessionId, schoolId }),
      Term.findOne({ _id: data.termId, schoolId }),
    ]);

    if (!cls) throw new BadRequestError('Class not found in this school.');
    if (!subject) throw new BadRequestError('Subject not found in this school.');
    if (!session) throw new BadRequestError('Session not found.');
    if (!term) throw new BadRequestError('Term not found.');

    const exam = new Exam({
      schoolId,
      name: String(data.name).trim(),
      classId: data.classId,
      subjectId: data.subjectId,
      subjectName: data.subjectName || subject.name,
      maxScore,
      date: data.date ? new Date(data.date) : new Date(),
      sessionId: data.sessionId,
      termId: data.termId,
    });
    await exam.save();

    return Exam.findById(exam._id)
      .populate('classId', 'name')
      .populate('subjectId', 'name code');
  }

  static async update(schoolId: string, id: string, data: any) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid exam id');
    const exam = await Exam.findOne({ _id: id, schoolId });
    if (!exam) throw new NotFoundError('Exam not found');

    if (data.name !== undefined) exam.name = String(data.name).trim();
    if (data.maxScore !== undefined) {
      const ms = Number(data.maxScore);
      if (!Number.isFinite(ms) || ms <= 0) {
        throw new BadRequestError('Max score must be a positive number.');
      }
      exam.maxScore = ms;
    }
    if (data.date !== undefined) exam.date = new Date(data.date);

    await exam.save();
    return exam;
  }

  static async delete(schoolId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid exam id');
    const deleted = await Exam.findOneAndDelete({ _id: id, schoolId });
    if (!deleted) throw new NotFoundError('Exam not found');
    return deleted;
  }
}
