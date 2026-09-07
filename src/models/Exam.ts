import mongoose, { Schema, Document } from 'mongoose';

export interface IExam extends Document {
  schoolId: mongoose.Types.ObjectId;
  name: string;
  sessionId: mongoose.Types.ObjectId;
  termId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  subjectId: mongoose.Types.ObjectId;
  maxScore: number;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ExamSchema = new Schema<IExam>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    maxScore: { type: Number, required: true },
    date: { type: Date, required: true },
  },
  { timestamps: true }
);

export const Exam = mongoose.model<IExam>('Exam', ExamSchema);
