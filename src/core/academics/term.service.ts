import { Term } from '../../models/Term';
import { NotFoundError } from '../../utils/errors';

export class TermService {
  static async create(data: any) {
    const term = new Term(data);
    await term.save();
    return term;
  }

  static async getById(id: string, schoolId: string) {
    const term = await Term.findOne({ _id: id, schoolId }).populate('sessionId');
    if (!term) throw new NotFoundError('Term not found');
    return term;
  }

  static async getAll(schoolId: string, query: any) {
    return Term.find({ schoolId, ...query }).populate('sessionId');
  }

  static async update(id: string, schoolId: string, data: any) {
    const term = await Term.findOneAndUpdate({ _id: id, schoolId }, data, { new: true });
    if (!term) throw new NotFoundError('Term not found');
    return term;
  }

  static async delete(id: string, schoolId: string) {
    const term = await Term.findOneAndDelete({ _id: id, schoolId });
    if (!term) throw new NotFoundError('Term not found');
    return term;
  }
}
