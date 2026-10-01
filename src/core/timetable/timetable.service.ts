// src/core/timetable/timetable.service.ts
import { TimetableEntry } from '../../models/TimetableEntry';
import { Class } from '../../models/Class';
import { Subject } from '../../models/Subject';
import { User } from '../../models/User';
import { School } from '../../models/School';
import { UserScope } from '../../middleware/scope.middleware';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../middleware/error.middleware';
import { isHHmm, toMinutes, oid, optOid } from '../../utils/validate';

const TYPES = ['LESSON', 'BREAK', 'EXAM'] as const;
const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

function shape(e: any) {
  return {
    id: String(e._id),
    classId: String(e.classId?._id || e.classId),
    className: e.classId?.name || undefined,
    subjectId: e.subjectId ? String(e.subjectId._id || e.subjectId) : null,
    subjectName: e.subjectId?.name || undefined,
    teacherId: e.teacherId ? String(e.teacherId._id || e.teacherId) : null,
    teacherName: e.teacherId?.name || undefined,
    type: e.type,
    day: e.day ?? null,
    dayName: e.day ? DAY_NAMES[e.day] : null,
    date: e.date || null,
    period: e.period ?? null,
    startTime: e.startTime,
    endTime: e.endTime,
    room: e.room || '',
    title: e.title || '',
    sessionId: String(e.sessionId),
    termId: String(e.termId),
  };
}

async function currentPeriod(schoolId: string, query: any = {}) {
  const school: any = await School.findById(schoolId).select('currentSessionId currentTermId').lean();
  const sessionId = optOid(query.sessionId, 'sessionId') || school?.currentSessionId;
  const termId = optOid(query.termId, 'termId') || school?.currentTermId;
  if (!sessionId || !termId) throw new BadRequestError('The school has no active session/term. Set one first.');
  return { sessionId: String(sessionId), termId: String(termId) };
}

function assertCanManageClass(scope: UserScope, classId: string) {
  if (scope.unrestricted) return;
  throw new ForbiddenError('Only the head teacher or an admin can change the timetable.');
}

export class TimetableService {
  // ------------------------------------------------------------------
  // Read
  // ------------------------------------------------------------------
  static async list(schoolId: string, scope: UserScope, query: any = {}) {
    const { sessionId, termId } = await currentPeriod(schoolId, query);
    const filter: any = { schoolId, sessionId, termId };

    const classId = optOid(query.classId, 'classId');
    const teacherId = optOid(query.teacherId, 'teacherId');
    if (classId) filter.classId = classId;
    if (teacherId) filter.teacherId = teacherId;
    if (query.day) filter.day = Number(query.day);
    if (query.type && (TYPES as readonly string[]).includes(String(query.type).toUpperCase())) {
      filter.type = String(query.type).toUpperCase();
    }

    // Teachers see their own lessons plus their form class.
    if (!scope.unrestricted) {
      const or: any[] = [{ teacherId: scope.userId }];
      if (scope.classIds && scope.classIds.length) or.push({ classId: { $in: scope.classIds } });
      filter.$and = [{ $or: or }];
    }

    const rows = await TimetableEntry.find(filter)
      .populate('classId', 'name')
      .populate('subjectId', 'name')
      .populate('teacherId', 'name')
      .sort({ day: 1, startTime: 1 })
      .lean();
    return rows.map(shape);
  }

  /** One class, grouped Monday..Sunday — ready to render as a weekly grid. */
  static async classWeek(schoolId: string, scope: UserScope, classId: string, query: any = {}) {
    oid(classId, 'classId');
    const entries = await TimetableService.list(schoolId, scope, { ...query, classId });
    const days = [1, 2, 3, 4, 5, 6, 7]
      .map((d) => ({
        day: d,
        dayName: DAY_NAMES[d],
        entries: entries.filter((e) => e.day === d && e.type !== 'EXAM'),
      }))
      .filter((d) => d.entries.length > 0 || d.day <= 5);
    return { classId, days, exams: entries.filter((e) => e.type === 'EXAM') };
  }

  /** The signed-in teacher's own week. */
  static async mine(schoolId: string, userId: string, query: any = {}) {
    const { sessionId, termId } = await currentPeriod(schoolId, query);
    const rows = await TimetableEntry.find({ schoolId, sessionId, termId, teacherId: userId })
      .populate('classId', 'name')
      .populate('subjectId', 'name')
      .sort({ day: 1, startTime: 1 })
      .lean();
    const entries = rows.map(shape);
    return {
      days: [1, 2, 3, 4, 5, 6, 7]
        .map((d) => ({ day: d, dayName: DAY_NAMES[d], entries: entries.filter((e) => e.day === d) }))
        .filter((d) => d.entries.length > 0),
    };
  }

  // ------------------------------------------------------------------
  // Validation + clash detection
  // ------------------------------------------------------------------
  private static async validate(schoolId: string, data: any, existingId?: string) {
    const type = String(data.type || 'LESSON').toUpperCase();
    if (!(TYPES as readonly string[]).includes(type)) throw new BadRequestError(`type must be one of: ${TYPES.join(', ')}`);

    const classId = oid(data.classId, 'classId');
    if (!isHHmm(data.startTime) || !isHHmm(data.endTime)) {
      throw new BadRequestError('startTime and endTime must be in HH:mm format (24-hour).');
    }
    if (toMinutes(data.startTime) >= toMinutes(data.endTime)) {
      throw new BadRequestError('The end time must be after the start time.');
    }

    let day: number | undefined;
    let date: Date | undefined;
    if (type === 'EXAM') {
      date = new Date(data.date);
      if (!data.date || isNaN(date.getTime())) throw new BadRequestError('An exam entry needs a valid date.');
    } else {
      day = Number(data.day);
      if (!Number.isInteger(day) || day < 1 || day > 7) throw new BadRequestError('day must be 1 (Monday) to 7 (Sunday).');
    }

    const cls = await Class.findOne({ _id: classId, schoolId }).select('_id').lean();
    if (!cls) throw new BadRequestError('Class not found in this school.');

    let subjectId: string | undefined;
    if (type !== 'BREAK') {
      subjectId = optOid(data.subjectId, 'subjectId');
      if (type === 'LESSON' && !subjectId) throw new BadRequestError('A lesson needs a subject.');
      if (subjectId) {
        const subj = await Subject.findOne({ _id: subjectId, schoolId }).select('classIds').lean();
        if (!subj) throw new BadRequestError('Subject not found in this school.');
      }
    }

    let teacherId = optOid(data.teacherId, 'teacherId');
    if (teacherId) {
      const teacher = await User.findOne({ _id: teacherId, schoolId, isActive: true }).select('_id').lean();
      if (!teacher) throw new BadRequestError('Teacher not found in this school.');
    }
    // If no teacher chosen, default to the teacher who takes that subject in that class.
    if (!teacherId && subjectId && type === 'LESSON') {
      const match: any = await User.findOne({
        schoolId,
        isActive: true,
        role: { $in: ['SUBJECT_TEACHER', 'FORM_TEACHER'] },
        subjectIds: subjectId,
      })
        .select('_id')
        .lean();
      if (match) teacherId = String(match._id);
    }

    const { sessionId, termId } = await currentPeriod(schoolId, data);

    // Clash detection: same class overlapping, or same teacher overlapping.
    const timeFilter: any = type === 'EXAM' ? { date } : { day, type: { $ne: 'EXAM' } };
    const base: any = { schoolId, sessionId, termId, ...timeFilter };
    if (existingId) base._id = { $ne: existingId };

    const classEntries: any[] = await TimetableEntry.find({ ...base, classId }).lean();
    const classClash = classEntries.find((e) => overlaps(data.startTime, data.endTime, e.startTime, e.endTime));
    if (classClash) {
      throw new ConflictError(
        `This class already has something from ${classClash.startTime} to ${classClash.endTime} on that ${type === 'EXAM' ? 'date' : 'day'}.`
      );
    }
    if (teacherId && type !== 'BREAK') {
      const teacherEntries: any[] = await TimetableEntry.find({ ...base, teacherId }).lean();
      const teacherClash = teacherEntries.find((e) => overlaps(data.startTime, data.endTime, e.startTime, e.endTime));
      if (teacherClash) {
        throw new ConflictError(
          `That teacher is already teaching from ${teacherClash.startTime} to ${teacherClash.endTime} at the same time.`
        );
      }
    }

    return {
      schoolId, sessionId, termId, classId, subjectId, teacherId, type, day, date,
      period: data.period ? Number(data.period) : undefined,
      startTime: data.startTime,
      endTime: data.endTime,
      room: data.room ? String(data.room).trim() : undefined,
      title: data.title ? String(data.title).trim().slice(0, 120) : undefined,
    };
  }

  // ------------------------------------------------------------------
  // Write
  // ------------------------------------------------------------------
  static async create(schoolId: string, scope: UserScope, data: any) {
    assertCanManageClass(scope, data?.classId);
    const payload = await TimetableService.validate(schoolId, data || {});
    const entry = await TimetableEntry.create({ ...payload, createdBy: scope.userId });
    return TimetableService.getById(schoolId, String(entry._id));
  }

  static async update(schoolId: string, scope: UserScope, id: string, data: any) {
    oid(id, 'id');
    assertCanManageClass(scope, id);
    const existing: any = await TimetableEntry.findOne({ _id: id, schoolId }).lean();
    if (!existing) throw new NotFoundError('Timetable entry not found');

    // Merge so a partial edit (e.g. just the room or the time) is validated as a whole.
    const merged = {
      type: existing.type,
      classId: String(existing.classId),
      subjectId: existing.subjectId ? String(existing.subjectId) : undefined,
      teacherId: existing.teacherId ? String(existing.teacherId) : undefined,
      day: existing.day,
      date: existing.date,
      period: existing.period,
      startTime: existing.startTime,
      endTime: existing.endTime,
      room: existing.room,
      title: existing.title,
      sessionId: String(existing.sessionId),
      termId: String(existing.termId),
      ...(data || {}),
    };
    // Allow explicitly clearing the teacher.
    if (data && data.teacherId === null) merged.teacherId = undefined;

    const payload = await TimetableService.validate(schoolId, merged, id);
    await TimetableEntry.updateOne({ _id: id, schoolId }, { $set: payload });
    return TimetableService.getById(schoolId, id);
  }

  static async remove(schoolId: string, scope: UserScope, id: string) {
    oid(id, 'id');
    assertCanManageClass(scope, id);
    const res = await TimetableEntry.findOneAndDelete({ _id: id, schoolId });
    if (!res) throw new NotFoundError('Timetable entry not found');
    return { deleted: true, id };
  }

  /**
   * Replace a class's whole week in one go (the "edit the whole timetable"
   * screen). Entries are validated together, so a clash inside the new set is
   * caught before anything is deleted.
   */
  static async replaceClassWeek(schoolId: string, scope: UserScope, classId: string, entries: any[], query: any = {}) {
    oid(classId, 'classId');
    assertCanManageClass(scope, classId);
    if (!Array.isArray(entries)) throw new BadRequestError('entries must be an array');
    if (entries.length > 120) throw new BadRequestError('Too many entries (max 120).');

    const { sessionId, termId } = await currentPeriod(schoolId, query);

    // 1. Validate the incoming set against itself.
    const byDay = new Map<number, any[]>();
    for (const e of entries) {
      const t = String(e.type || 'LESSON').toUpperCase();
      if (t === 'EXAM') throw new BadRequestError('Exam entries are managed separately.');
      if (!isHHmm(e.startTime) || !isHHmm(e.endTime) || toMinutes(e.startTime) >= toMinutes(e.endTime)) {
        throw new BadRequestError('Every entry needs a valid startTime before its endTime (HH:mm).');
      }
      const d = Number(e.day);
      if (!Number.isInteger(d) || d < 1 || d > 7) throw new BadRequestError('Every entry needs a day from 1 to 7.');
      const list = byDay.get(d) || [];
      for (const other of list) {
        if (overlaps(e.startTime, e.endTime, other.startTime, other.endTime)) {
          throw new ConflictError(`${DAY_NAMES[d]}: ${e.startTime}-${e.endTime} overlaps ${other.startTime}-${other.endTime}.`);
        }
      }
      list.push(e);
      byDay.set(d, list);
    }

    // 2. Snapshot the old week, clear it, then insert entry by entry (each one
    //    is checked against teachers' other classes). On any failure, restore.
    const old: any[] = await TimetableEntry.find({ schoolId, classId, sessionId, termId, type: { $ne: 'EXAM' } }).lean();
    await TimetableEntry.deleteMany({ schoolId, classId, sessionId, termId, type: { $ne: 'EXAM' } });
    try {
      for (const e of entries) {
        const payload = await TimetableService.validate(schoolId, { ...e, classId, sessionId, termId });
        await TimetableEntry.create({ ...payload, createdBy: scope.userId });
      }
    } catch (err) {
      await TimetableEntry.deleteMany({ schoolId, classId, sessionId, termId, type: { $ne: 'EXAM' } });
      if (old.length) await TimetableEntry.insertMany(old);
      throw err;
    }
    return TimetableService.classWeek(schoolId, scope, classId, { sessionId, termId });
  }

  static async getById(schoolId: string, id: string) {
    const row: any = await TimetableEntry.findOne({ _id: id, schoolId })
      .populate('classId', 'name')
      .populate('subjectId', 'name')
      .populate('teacherId', 'name')
      .lean();
    if (!row) throw new NotFoundError('Timetable entry not found');
    return shape(row);
  }

  /** Used by the parent/student portal. Lessons for a class, grouped by day. */
  static async forClass(schoolId: string, classId: string) {
    const { sessionId, termId } = await currentPeriod(schoolId, {});
    const rows = await TimetableEntry.find({ schoolId, classId, sessionId, termId })
      .populate('subjectId', 'name')
      .populate('teacherId', 'name')
      .sort({ day: 1, startTime: 1 })
      .lean();
    const entries = rows.map(shape);
    return {
      days: [1, 2, 3, 4, 5, 6, 7]
        .map((d) => ({ day: d, dayName: DAY_NAMES[d], entries: entries.filter((e) => e.day === d && e.type !== 'EXAM') }))
        .filter((d) => d.entries.length > 0),
      exams: entries.filter((e) => e.type === 'EXAM'),
    };
  }
}
