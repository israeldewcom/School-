// src/models/Assignment.ts
import mongoose, { Schema, Document } from 'mongoose';

export type AssignmentStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';
export type SubmissionStatus = 'SUBMITTED' | 'GRADED' | 'RETURNED';

export interface IAttachment {
  name: string;
  url: string;
}

export interface IAssignment extends Document {
  schoolId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  subjectId: mongoose.Types.ObjectId;
  sessionId?: mongoose.Types.ObjectId;
  termId?: mongoose.Types.ObjectId;
  teacherId: mongoose.Types.ObjectId; // User who set it
  teacherName?: string;
  title: string;
  instructions?: string;
  attachments: IAttachment[];
  dueDate?: Date;
  maxScore: number;
  allowLate: boolean;
  status: AssignmentStatus;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AttachmentSchema = new Schema<IAttachment>(
  { name: { type: String, required: true }, url: { type: String, required: true } },
  { _id: false }
);

const AssignmentSchema = new Schema<IAssignment>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session' },
    termId: { type: Schema.Types.ObjectId, ref: 'Term' },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teacherName: { type: String },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    instructions: { type: String, trim: true, maxlength: 10000 },
    attachments: { type: [AttachmentSchema], default: [] },
    dueDate: { type: Date },
    maxScore: { type: Number, default: 10, min: 0 },
    allowLate: { type: Boolean, default: true },
    status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'CLOSED'], default: 'DRAFT', index: true },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

AssignmentSchema.index({ schoolId: 1, classId: 1, status: 1, dueDate: 1 });

export interface IAssignmentSubmission extends Document {
  schoolId: mongoose.Types.ObjectId;
  assignmentId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  text?: string;
  attachments: IAttachment[];
  submittedAt: Date;
  late: boolean;
  status: SubmissionStatus;
  score?: number;
  feedback?: string;
  gradedBy?: mongoose.Types.ObjectId;
  gradedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AssignmentSubmissionSchema = new Schema<IAssignmentSubmission>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    assignmentId: { type: Schema.Types.ObjectId, ref: 'Assignment', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    text: { type: String, trim: true, maxlength: 20000 },
    attachments: { type: [AttachmentSchema], default: [] },
    submittedAt: { type: Date, default: Date.now },
    late: { type: Boolean, default: false },
    status: { type: String, enum: ['SUBMITTED', 'GRADED', 'RETURNED'], default: 'SUBMITTED' },
    score: { type: Number, min: 0 },
    feedback: { type: String, trim: true, maxlength: 5000 },
    gradedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    gradedAt: { type: Date },
  },
  { timestamps: true }
);

AssignmentSubmissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });

export const Assignment = mongoose.model<IAssignment>('Assignment', AssignmentSchema);
export const AssignmentSubmission = mongoose.model<IAssignmentSubmission>(
  'AssignmentSubmission',
  AssignmentSubmissionSchema
);
