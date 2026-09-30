// src/models/Task.ts
import mongoose, { Schema, Document } from 'mongoose';

export type TaskStatus =
  | 'TODO'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export const TASK_STATUSES: TaskStatus[] = [
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
];

export const TASK_CATEGORIES = [
  'ACADEMIC',
  'ADMIN',
  'MAINTENANCE',
  'DISCIPLINE',
  'HOSTEL',
  'FINANCE',
  'EVENT',
  'OTHER',
] as const;

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export interface ITask extends Document {
  schoolId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  category: (typeof TASK_CATEGORIES)[number];
  priority: (typeof TASK_PRIORITIES)[number];
  status: TaskStatus;
  dueDate?: Date;
  assignedTo: mongoose.Types.ObjectId[];
  createdBy: mongoose.Types.ObjectId;
  createdByName?: string;
  createdByRole?: string;
  parentTaskId?: mongoose.Types.ObjectId;
  checklist: Array<{ text: string; done: boolean }>;
  comments: Array<{ userId: mongoose.Types.ObjectId; name?: string; text: string; at: Date }>;
  submittedAt?: Date;
  submissionNote?: string;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  reviewNote?: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<ITask>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 5000 },
    category: { type: String, enum: TASK_CATEGORIES, default: 'OTHER' },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'MEDIUM' },
    status: { type: String, enum: TASK_STATUSES, default: 'TODO', index: true },
    dueDate: { type: Date },
    assignedTo: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdByName: { type: String },
    createdByRole: { type: String },
    parentTaskId: { type: Schema.Types.ObjectId, ref: 'Task', index: true },
    checklist: [
      {
        text: { type: String, required: true, trim: true },
        done: { type: Boolean, default: false },
        _id: false,
      },
    ],
    comments: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        name: { type: String },
        text: { type: String, required: true, trim: true, maxlength: 2000 },
        at: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    submittedAt: { type: Date },
    submissionNote: { type: String, trim: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNote: { type: String, trim: true },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

TaskSchema.index({ schoolId: 1, status: 1, dueDate: 1 });
TaskSchema.index({ schoolId: 1, assignedTo: 1, status: 1 });
TaskSchema.index({ schoolId: 1, createdBy: 1, status: 1 });

export const Task = mongoose.model<ITask>('Task', TaskSchema);
