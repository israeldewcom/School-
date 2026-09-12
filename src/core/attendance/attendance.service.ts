import { Attendance } from '../../models/Attendance';
import { Student } from '../../models/Student';
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

  // NEW: Get attendance history for a student with date range
  static async getStudentAttendance(studentId: string, schoolId: string, from?: Date, to?: Date) {
    const query: any = { studentId, schoolId };
    if (from && to) query.date = { $gte: from, $lte: to };
    return Attendance.find(query).sort({ date: -1 });
  }

  // NEW: Get summary statistics
  static async getAttendanceSummary(studentId: string, schoolId: string) {
    const records = await Attendance.find({ studentId, schoolId });
    const total = records.length;
    const present = records.filter((r) => r.status === 'PRESENT').length;
    const absent = records.filter((r) => r.status === 'ABSENT').length;
    const late = records.filter((r) => r.status === 'LATE').length;
    const excused = records.filter((r) => r.status === 'EXCUSED').length;
    return {
      total,
      present,
      absent,
      late,
      excused,
      rate: total > 0 ? (present / total) * 100 : 0,
    };
  }

  // ------------------------------------------------------------------
  // Whole-school attendance for today: how many active students have
  // been marked, and the breakdown by status. Feeds the "today" widget
  // on the attendance page.
  // ------------------------------------------------------------------
  static async getTodaySummary(schoolId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const [totalActiveStudents, records] = await Promise.all([
      Student.countDocuments({ schoolId, status: 'ACTIVE' }),
      Attendance.find({ schoolId, date: { $gte: startOfDay, $lte: endOfDay } }).lean(),
    ]);

    const present = records.filter((r) => r.status === 'PRESENT').length;
    const absent = records.filter((r) => r.status === 'ABSENT').length;
    const late = records.filter((r) => r.status === 'LATE').length;
    const excused = records.filter((r) => r.status === 'EXCUSED').length;
    const marked = records.length;

    return {
      date: startOfDay.toISOString(),
      totalActiveStudents,
      marked,
      unmarked: Math.max(totalActiveStudents - marked, 0),
      present,
      absent,
      late,
      excused,
      rate: totalActiveStudents > 0 ? (present / totalActiveStudents) * 100 : 0,
    };
  }

  // ------------------------------------------------------------------
  // Daily present-rate for the last 7 days. Feeds the "weekly" trend
  // widget on the attendance page.
  // ------------------------------------------------------------------
  static async getWeeklySummary(schoolId: string) {
    const start = new Date();
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    const totalActiveStudents = await Student.countDocuments({ schoolId, status: 'ACTIVE' });

    const results = await Attendance.aggregate([
      { $match: { schoolId, date: { $gte: start } } },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
            day: { $dayOfMonth: '$date' },
          },
          present: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } },
          total: { $sum: 1 },
        },
      },
    ]);

    const byKey = new Map<string, { present: number; total: number }>();
    for (const r of results) {
      byKey.set(`${r._id.year}-${r._id.month}-${r._id.day}`, { present: r.present, total: r.total });
    }

    const labels: string[] = [];
    const rates: number[] = [];
    const cursor = new Date(start);
    for (let i = 0; i < 7; i++) {
      const key = `${cursor.getFullYear()}-${cursor.getMonth() + 1}-${cursor.getDate()}`;
      const day = byKey.get(key);
      labels.push(cursor.toLocaleDateString('en-US', { weekday: 'short' }));
      rates.push(day && totalActiveStudents > 0 ? (day.present / totalActiveStudents) * 100 : 0);
      cursor.setDate(cursor.getDate() + 1);
    }

    return { labels, rates, totalActiveStudents };
  }
}
