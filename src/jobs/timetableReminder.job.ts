// src/jobs/timetableReminder.job.ts
//
// Runs every 5 minutes. For each school it finds lessons that start within the
// school's reminder lead time (default 10 min) and tells the class's students
// (and the teacher) in-app. Redis NX keys make sure a lesson is announced once
// per day even if the job overlaps or retries.
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { School } from '../models/School';
import { TimetableEntry } from '../models/TimetableEntry';
import { Student } from '../models/Student';
import { User } from '../models/User';
import { Subject } from '../models/Subject';
import { redis } from '../config/redis';
import { Notifier } from '../services/notifier.service';
import { timetableQueue } from './queues';
import logger from '../config/logger';

dayjs.extend(utc);
dayjs.extend(timezone);

const WINDOW_MINUTES = 5; // must match the repeat interval

function hhmmToMinutes(v: string): number {
  const [h, m] = String(v).split(':').map(Number);
  return h * 60 + m;
}

export async function runTimetableReminders(): Promise<{ sent: number }> {
  const schools: any[] = await School.find({ status: 'ACTIVE', currentTermId: { $exists: true, $ne: '' } })
    .select('timezone currentTermId currentSessionId notificationSettings')
    .lean();

  let sent = 0;

  for (const school of schools) {
    try {
      const lead = school.notificationSettings?.classReminderMinutes ?? 10;
      if (!lead) continue; // school switched reminders off

      const tz = school.timezone || 'Africa/Lagos';
      const now = dayjs().tz(tz);
      const isoDay = now.day() === 0 ? 7 : now.day(); // 1=Mon..7=Sun
      const nowMin = now.hour() * 60 + now.minute();
      const from = nowMin + lead;
      const to = from + WINDOW_MINUTES;

      const entries: any[] = await TimetableEntry.find({
        schoolId: school._id,
        termId: school.currentTermId,
        type: 'LESSON',
        day: isoDay,
      }).lean();

      const due = entries.filter((e) => {
        const start = hhmmToMinutes(e.startTime);
        return start >= from && start < to;
      });
      if (due.length === 0) continue;

      const subjectIds = [...new Set(due.map((e) => String(e.subjectId)).filter((x) => x !== 'undefined'))];
      const subjects: any[] = subjectIds.length ? await Subject.find({ _id: { $in: subjectIds } }).select('name').lean() : [];
      const subjectName = new Map(subjects.map((s) => [String(s._id), s.name]));

      for (const e of due) {
        const key = `ttr:${e._id}:${now.format('YYYY-MM-DD')}`;
        const fresh = await redis.set(key, '1', 'EX', 86400, 'NX');
        if (!fresh) continue;

        const name = subjectName.get(String(e.subjectId)) || e.title || 'Class';
        const body = `${name} starts at ${e.startTime}${e.room ? ` in ${e.room}` : ''}.`;

        const students: any[] = await Student.find({
          schoolId: school._id,
          classId: e.classId,
          status: 'ACTIVE',
        })
          .select('_id')
          .lean();
        const studentUsers: any[] = students.length
          ? await User.find({
              schoolId: school._id,
              role: 'STUDENT',
              isActive: true,
              studentId: { $in: students.map((s) => s._id) },
            })
              .select('_id')
              .lean()
          : [];

        const recipients = studentUsers.map((u) => u._id);
        if (e.teacherId) recipients.push(e.teacherId);

        sent += await Notifier.users(String(school._id), recipients, 'Class starting soon', body, {
          kind: 'TIMETABLE_REMINDER',
          entryId: String(e._id),
        });
      }
    } catch (err: any) {
      logger.warn(`timetable reminder failed for school ${school?._id}: ${err?.message}`);
    }
  }
  return { sent };
}

export async function startTimetableReminderJob(): Promise<void> {
  try {
    const repeatables = await timetableQueue.getRepeatableJobs();
    for (const r of repeatables) {
      if (r.name === 'timetable-reminders') await timetableQueue.removeRepeatableByKey(r.key);
    }
  } catch (_) {}
  await timetableQueue.add('timetable-reminders', {}, {
    repeat: { pattern: '*/5 * * * *' },
    jobId: 'timetable-reminders-5min',
  });
  logger.info('Timetable reminder job scheduled (every 5 minutes)');
}
