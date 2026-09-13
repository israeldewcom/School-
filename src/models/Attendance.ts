// src/models/Attendance.ts
import mongoose, { Schema, Document } from 'mongoose';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export interface IAttendance extends Document {
  schoolId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  termId: mongoose.Types.ObjectId;
  date: Date;              // date-only, midnight-normalized
  status: AttendanceStatus;
  remark?: string;
  timestamp: Date;         // full timestamp of when the record was marked
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceSchema = new Schema<IAttendance>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    date: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'],
      required: true,
      default: 'PRESENT',
    },
    remark: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One attendance record per student per day.
AttendanceSchema.index({ schoolId: 1, studentId: 1, date: 1 }, { unique: true });

// Fast class-level queries for the daily roster view.
AttendanceSchema.index({ schoolId: 1, classId: 1, date: 1 });

export const Attendance = mongoose.model<IAttendance>('Attendance', AttendanceSchema);
