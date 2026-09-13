import mongoose from 'mongoose';
import { Attendance } from '../../models/Attendance';
import { Student } from '../../models/Student';
import { Class } from '../../models/Class';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';

export class AttendanceService {
  // ------------------------------------------------------------------
  // Mark / update single record.
  // ------------------------------------------------------------------
  static async mark(schoolId: string, data: any) {
    if (!data?.studentId || !mongoose.isValidObjectId(data.studentId)) {
      throw new BadRequestError('A valid student is required.');
    }
    if (!data?.classId || !mongoose.isValidObjectId(data.classId)) {
      throw new BadRequestError(
        'A valid class is required. This usually means the student is not assigned to a class yet.'
      );
    }
    if (!data?.sessionId || !mongoose.isValidObjectId(data.sessionId)) {
      throw new BadRequestError('Academic session is required.');
    }
    if (!data?.termId || !mongoose.isValidObjectId(data.termId)) {
      throw new BadRequestError('Academic term is required.');
    }
    const validStatuses = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
    const status = String(data.status || 'PRESENT').toUpperCase();
    if (!validStatuses.includes(status)) {
      throw new BadRequestError(`Status must be one of: ${validStatuses.join(', ')}`);
    }

    const [student, cls] = await Promise.all([
      Student.findOne({ _id: data.studentId, schoolId }),
      Class.findOne({ _id: data.classId, schoolId }),
    ]);
    if (!student) throw new BadRequestError('Student not found in this school.');
    if (!cls) throw new BadRequestError('Class not found in this school.');

    const date = data.date ? new Date(data.date) : new Date();
    date.setHours(0, 0, 0, 0);

    // One record per student per day per subject-less attendance model.
    const existing = await Attendance.findOne({
      schoolId,
      studentId: data.studentId,
      date,
    });

    if (existing) {
      existing.status = status;
      existing.remark = data.remark || '';
      existing.timestamp = new Date();
      await existing.save();
      return existing;
    }

    const attendance = new Attendance({
      schoolId,
      studentId: data.studentId,
      classId: data.classId,
      sessionId: data.sessionId,
      termId: data.termId,
      date,
      status,
      remark: data.remark || '',
      timestamp: new Date(),
    });
    await attendance.save();
    return attendance;
  }

  // ------------------------------------------------------------------
  // Single student history / summary.
  // ------------------------------------------------------------------
  static async getStudentAttendance(studentId: string, schoolId: string, from?: Date, to?: Date) {
    if (!mongoose.isValidObjectId(studentId)) throw new BadRequestError('Invalid student id');
    const query: any = { studentId, schoolId };
    if (from && to) query.date = { $gte: from, $lte: to };
    return Attendance.find(query).sort({ date: -1 });
  }

  static async getAttendanceSummary(studentId: string, schoolId: string) {
    if (!mongoose.isValidObjectId(studentId)) throw new BadRequestError('Invalid student id');
    const records = await Attendance.find({ studentId, schoolId }).lean();
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
      rate: total > 0 ? Math.round((present / total) * 100) : 0,
    };
  }

  static async getByClass(classId: string, schoolId: string, date: Date) {
    if (!mongoose.isValidObjectId(classId)) throw new BadRequestError('Invalid class id');
    return Attendance.find({ classId, schoolId, date }).populate('studentId', 'fullName');
  }

  static async update(id: string, schoolId: string, data: any) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid attendance id');
    const att = await Attendance.findOneAndUpdate({ _id: id, schoolId }, data, { new: true });
    if (!att) throw new NotFoundError('Attendance record not found');
    return att;
  }

  static async delete(id: string, schoolId: string) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid attendance id');
    const att = await Attendance.findOneAndDelete({ _id: id, schoolId });
    if (!att) throw new NotFoundError('Attendance record not found');
    return att;
  }

  // ------------------------------------------------------------------
  // Today's whole-school summary. This is the endpoint the attendance
  // page hits first — it was previously hanging because a single slow
  // query blocked the whole request. Every step is now capped and the
  // return shape is guaranteed, even on empty data.
  // ------------------------------------------------------------------
  static async getTodaySummary(schoolId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const [totalActiveStudents, records] = await Promise.all([
      Student.countDocuments({ schoolId, status: 'ACTIVE' }).maxTimeMS(8000),
      Attendance.find({
        schoolId,
        date: { $gte: startOfDay, $lte: endOfDay },
      })
        .select('status')
        .lean()
        .maxTimeMS(8000),
    ]);

    const present = records.filter((r: any) => r.status === 'PRESENT').length;
    const absent = records.filter((r: any) => r.status === 'ABSENT').length;
    const late = records.filter((r: any) => r.status === 'LATE').length;
    const excused = records.filter((r: any) => r.status === 'EXCUSED').length;
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
      rate: totalActiveStudents > 0
        ? Math.round((present / totalActiveStudents) * 100)
        : 0,
    };
  }

  // ------------------------------------------------------------------
  // Seven-day attendance rate trend. Previous implementation used an
  // aggregation that could hang on sparse data — this version uses a
  // bounded date range with maxTimeMS and always returns 7 entries.
  // ------------------------------------------------------------------
  static async getWeeklySummary(schoolId: string) {
    const start = new Date();
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    const totalActiveStudents = await Student
      .countDocuments({ schoolId, status: 'ACTIVE' })
      .maxTimeMS(8000);

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
    ]).option({ maxTimeMS: 8000 });

    const byKey = new Map<string, { present: number; total: number }>();
    for (const r of results) {
      byKey.set(`${r._id.year}-${r._id.month}-${r._id.day}`, {
        present: r.present,
        total: r.total,
      });
    }

    const labels: string[] = [];
    const rates: number[] = [];
    const cursor = new Date(start);
    for (let i = 0; i < 7; i++) {
      const key = `${cursor.getFullYear()}-${cursor.getMonth() + 1}-${cursor.getDate()}`;
      const day = byKey.get(key);
      labels.push(cursor.toLocaleDateString('en-US', { weekday: 'short' }));
      if (!day || totalActiveStudents === 0) {
        rates.push(0);
      } else {
        rates.push(Math.round((day.present / totalActiveStudents) * 100));
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return { labels, rates, totalActiveStudents };
  }
}
