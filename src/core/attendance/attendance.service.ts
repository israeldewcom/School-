// src/core/attendance/attendance.service.ts
import mongoose from 'mongoose';
import { Notifier } from '../../services/notifier.service';
import { Attendance } from '../../models/Attendance';
import { Student } from '../../models/Student';
import { Class } from '../../models/Class';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';

// Narrow union so we can assign typed statuses without fighting the
// schema's enum. Kept in sync with AttendanceSchema.status.
type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
const VALID_STATUSES: readonly AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];

export class AttendanceService {
  // ------------------------------------------------------------------
  // Mark or update a single student's attendance for a given day.
  // Idempotent: calling twice updates the existing record instead of
  // creating a duplicate.
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

    const rawStatus = String(data.status || 'PRESENT').toUpperCase();
    if (!(VALID_STATUSES as readonly string[]).includes(rawStatus)) {
      throw new BadRequestError(`Status must be one of: ${VALID_STATUSES.join(', ')}`);
    }
    const status = rawStatus as AttendanceStatus;

    const [student, cls] = await Promise.all([
      Student.findOne({ _id: data.studentId, schoolId }),
      Class.findOne({ _id: data.classId, schoolId }),
    ]);
    if (!student) throw new BadRequestError('Student not found in this school.');
    if (!cls) throw new BadRequestError('Class not found in this school.');

    const date = data.date ? new Date(data.date) : new Date();
    date.setHours(0, 0, 0, 0);

    // One record per student per day — update if present.
    const existing = await Attendance.findOne({
      schoolId,
      studentId: data.studentId,
      date,
    });

    if (existing) {
      existing.status = status;
      existing.remark = data.remark || '';
      existing.timestamp = new Date();
      const changed = existing.isModified('status');
      await existing.save();
      if (changed) AttendanceService.alertParent(schoolId, student, status, date);
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
    AttendanceService.alertParent(schoolId, student, status, date);
    return attendance;
  }

  /**
   * Tell the family when a child is marked ABSENT or LATE today. Fire-and-forget:
   * a notification problem must never block marking the register. Old dates
   * (back-filled registers) are not announced.
   */
  private static alertParent(schoolId: string, student: any, status: string, date: Date) {
    if (status !== 'ABSENT' && status !== 'LATE') return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date.getTime() !== today.getTime()) return;

    const name = student.fullName || `${student.firstName || ''} ${student.lastName || ''}`.trim();
    const word = status === 'ABSENT' ? 'absent from school' : 'late to school';
    void Notifier.families(schoolId, [student._id], {
      title: status === 'ABSENT' ? 'Absent today' : 'Late today',
      body: `${name} was marked ${word} today.`,
      sms: `${name} was marked ${word} today. Please contact the school if this is unexpected.`,
      smsSetting: 'smsOnAbsence',
      metadata: { kind: 'ATTENDANCE', status, studentId: String(student._id) },
    });
  }

  // ------------------------------------------------------------------
  // Per-student history with optional date range.
  // ------------------------------------------------------------------
  static async getStudentAttendance(
    studentId: string,
    schoolId: string,
    from?: Date,
    to?: Date
  ) {
    if (!mongoose.isValidObjectId(studentId)) {
      throw new BadRequestError('Invalid student id');
    }
    const query: any = { studentId, schoolId };
    if (from && to) query.date = { $gte: from, $lte: to };
    return Attendance.find(query).sort({ date: -1 });
  }

  // ------------------------------------------------------------------
  // Aggregate stats for one student — used by the parent portal and
  // the student detail modal.
  // ------------------------------------------------------------------
  static async getAttendanceSummary(studentId: string, schoolId: string) {
    if (!mongoose.isValidObjectId(studentId)) {
      throw new BadRequestError('Invalid student id');
    }
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

  // ------------------------------------------------------------------
  // Roster for a class on a specific day. Populates student name so
  // the mobile attendance view can render without a second request.
  // ------------------------------------------------------------------
  static async getByClass(classId: string, schoolId: string, date: Date) {
    if (!mongoose.isValidObjectId(classId)) {
      throw new BadRequestError('Invalid class id');
    }
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    return Attendance.find({ classId, schoolId, date: startOfDay })
      .populate('studentId', 'fullName admissionNumber');
  }

  // ------------------------------------------------------------------
  // Record-level update — used when a teacher edits a single row
  // after saving the full register.
  // ------------------------------------------------------------------
  static async update(id: string, schoolId: string, data: any) {
    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestError('Invalid attendance id');
    }
    // Normalize status if it's being changed.
    if (data?.status !== undefined) {
      const rawStatus = String(data.status).toUpperCase();
      if (!(VALID_STATUSES as readonly string[]).includes(rawStatus)) {
        throw new BadRequestError(`Status must be one of: ${VALID_STATUSES.join(', ')}`);
      }
      data.status = rawStatus as AttendanceStatus;
    }
    const att = await Attendance.findOneAndUpdate({ _id: id, schoolId }, data, {
      new: true,
      runValidators: true,
    });
    if (!att) throw new NotFoundError('Attendance record not found');
    return att;
  }

  static async delete(id: string, schoolId: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestError('Invalid attendance id');
    }
    const att = await Attendance.findOneAndDelete({ _id: id, schoolId });
    if (!att) throw new NotFoundError('Attendance record not found');
    return att;
  }

  // ------------------------------------------------------------------
  // Whole-school attendance for today.
  //
  // Every query is bounded with maxTimeMS so a slow or sparse dataset
  // can never hang the request. The response shape is guaranteed even
  // when no attendance has been marked yet.
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
      rate:
        totalActiveStudents > 0
          ? Math.round((present / totalActiveStudents) * 100)
          : 0,
    };
  }

  // ------------------------------------------------------------------
  // Seven-day present-rate trend.
  //
  // Returns exactly seven entries — weekends and unmarked days show
  // as 0 rather than being omitted, which keeps the chart's X-axis
  // stable across refreshes.
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
