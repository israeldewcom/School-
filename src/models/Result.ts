import mongoose, { Schema, Document } from 'mongoose';

export interface IResult extends Document {
  schoolId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  termId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  subjectId: mongoose.Types.ObjectId;
  caScore: number;
  examScore: number;
  total: number;
  grade: string;
  remark: string;
  createdAt: Date;
  updatedAt: Date;
}

const ResultSchema = new Schema<IResult>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    caScore: { type: Number, required: true },
    examScore: { type: Number, required: true },
    total: { type: Number, required: true },
    grade: { type: String, required: true },
    remark: { type: String, required: true },
  },
  { timestamps: true }
);

ResultSchema.index({ studentId: 1, subjectId: 1, termId: 1, sessionId: 1 }, { unique: true });

export const Result = mongoose.model<IResult>('Result', ResultSchema);
