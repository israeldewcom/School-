import { Session } from '../../models/Session';
import { NotFoundError } from '../../utils/errors';

export class SessionService {
  static async create(data: any) {
    const session = new Session(data);
    await session.save();
    return session;
  }

  static async getById(id: string, schoolId: string) {
    const session = await Session.findOne({ _id: id, schoolId });
    if (!session) throw new NotFoundError('Session not found');
    return session;
  }

  static async getAll(schoolId: string, query: any) {
    return Session.find({ schoolId, ...query });
  }

  static async update(id: string, schoolId: string, data: any) {
    const session = await Session.findOneAndUpdate({ _id: id, schoolId }, data, { new: true });
    if (!session) throw new NotFoundError('Session not found');
    return session;
  }

  static async delete(id: string, schoolId: string) {
    const session = await Session.findOneAndDelete({ _id: id, schoolId });
    if (!session) throw new NotFoundError('Session not found');
    return session;
  }
}
