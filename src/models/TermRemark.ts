// src/models/TermRemark.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IRating {
  trait: string;
  rating: number; // 1 (poor) to 5 (excellent)
}

export interface ITermRemark extends Document {
  schoolId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  termId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  teacherComment?: string;
  principalComment?: string;
  psychomotor: IRating[];
  affective: IRating[];
  enteredBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RatingSchema = new Schema<IRating>(
  {
    trait: { type: String, required: true, trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
  },
  { _id: false }
);

const TermRemarkSchema = new Schema<ITermRemark>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    teacherComment: { type: String, trim: true, maxlength: 1000 },
    principalComment: { type: String, trim: true, maxlength: 1000 },
    psychomotor: { type: [RatingSchema], default: [] },
    affective: { type: [RatingSchema], default: [] },
    enteredBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

TermRemarkSchema.index({ studentId: 1, termId: 1, sessionId: 1 }, { unique: true });
TermRemarkSchema.index({ schoolId: 1, classId: 1, termId: 1, sessionId: 1 });

export const TermRemark = mongoose.model<ITermRemark>('TermRemark', TermRemarkSchema);
