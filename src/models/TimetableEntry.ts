// src/models/TimetableEntry.ts
import mongoose, { Schema, Document } from 'mongoose';

export type TimetableType = 'LESSON' | 'BREAK' | 'EXAM';

export interface ITimetableEntry extends Document {
  schoolId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  termId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  subjectId?: mongoose.Types.ObjectId;
  teacherId?: mongoose.Types.ObjectId; // User id of the teacher
  type: TimetableType;
  day?: number;   // 1 = Monday ... 7 = Sunday (LESSON and BREAK)
  date?: Date;    // calendar date (EXAM only)
  period?: number;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  room?: string;
  title?: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TimetableEntrySchema = new Schema<ITimetableEntry>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, enum: ['LESSON', 'BREAK', 'EXAM'], default: 'LESSON' },
    day: { type: Number, min: 1, max: 7 },
    date: { type: Date },
    period: { type: Number, min: 1 },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    room: { type: String, trim: true },
    title: { type: String, trim: true, maxlength: 120 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

TimetableEntrySchema.index({ schoolId: 1, termId: 1, sessionId: 1, classId: 1, day: 1, startTime: 1 });
TimetableEntrySchema.index({ schoolId: 1, teacherId: 1, termId: 1, day: 1 });
TimetableEntrySchema.index({ schoolId: 1, classId: 1, date: 1 });

export const TimetableEntry = mongoose.model<ITimetableEntry>('TimetableEntry', TimetableEntrySchema);
