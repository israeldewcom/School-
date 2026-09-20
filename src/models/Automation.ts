// src/models/Automation.ts
import mongoose, { Schema, Document } from 'mongoose';

export type AutomationActionType =
  | 'SMS'
  | 'EMAIL'
  | 'IN_APP'
  | 'WEBHOOK'
  | 'SMS_TO_PARENT'
  | 'SMS_TO_STAFF';

export type AutomationEvent =
  | 'fee_overdue'
  | 'payment_received'
  | 'attendance_low'
  | 'invoice_issued'
  | 'term_closed'
  | 'student_enrolled';

export interface IAutomationAction {
  type: AutomationActionType;
  config?: Record<string, any>;
}

export interface IAutomation extends Document {
  schoolId: mongoose.Types.ObjectId;
  name: string;
  event: AutomationEvent | string;
  /** JSON-Logic string, e.g. '{"gte":[{"var":"daysOverdue"},7]}' */
  condition?: string;
  actions: IAutomationAction[];
  isEnabled: boolean;
  lastRunAt?: Date;
  lastRunStatus?: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  lastRunMessage?: string;
  runCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const ActionSchema = new Schema<IAutomationAction>(
  {
    type: {
      type: String,
      enum: ['SMS', 'EMAIL', 'IN_APP', 'WEBHOOK', 'SMS_TO_PARENT', 'SMS_TO_STAFF'],
      required: true,
    },
    config: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const AutomationSchema = new Schema<IAutomation>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true, trim: true },
    event: { type: String, required: true, trim: true, index: true },
    condition: { type: String },
    actions: { type: [ActionSchema], default: [] },
    isEnabled: { type: Boolean, default: true, index: true },
    lastRunAt: { type: Date },
    lastRunStatus: { type: String, enum: ['SUCCESS', 'FAILED', 'SKIPPED'] },
    lastRunMessage: { type: String },
    runCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

AutomationSchema.index({ schoolId: 1, event: 1, isEnabled: 1 });

export const Automation = mongoose.model<IAutomation>('Automation', AutomationSchema);
