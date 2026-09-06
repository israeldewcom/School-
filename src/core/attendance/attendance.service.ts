import { Attendance } from '../../models/Attendance';
import { NotFoundError } from '../../utils/errors';

export class AttendanceService {
  static async mark(data: any) {
    const attendance = new Attendance(data);
    await attendance.save();
    return attendance;
  }

  static async getByStudent(studentId: string, schoolId: string, query: any) {
    return Attendance.find({ studentId, schoolId, ...query }).sort({ date: -1 });
  }

  static async getByClass(classId: string, schoolId: string, date: Date) {
    return Attendance.find({ classId, schoolId, date }).populate('studentId');
  }

  static async update(id: string, schoolId: string, data: any) {
    const att = await Attendance.findOneAndUpdate({ _id: id, schoolId }, data, { new: true });
    if (!att) throw new NotFoundError('Attendance record not found');
    return att;
  }

  static async delete(id: string, schoolId: string) {
    const att = await Attendance.findOneAndDelete({ _id: id, schoolId });
    if (!att) throw new NotFoundError('Attendance record not found');
    return att;
  }
}
