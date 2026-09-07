import mongoose, { Schema, Document } from 'mongoose';

export interface IAutomation extends Document {
  schoolId: mongoose.Types.ObjectId;
  name: string;
  event: string;
  condition?: string;
  actions: Array<{
    type: 'SMS' | 'EMAIL' | 'IN_APP' | 'WEBHOOK';
    config: any;
  }>;
  isEnabled: boolean;
  schedule?: string;
  retryPolicy?: { attempts: number; backoff: number };
  lastRun?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AutomationSchema = new Schema<IAutomation>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true },
    event: { type: String, required: true },
    condition: String,
    actions: [
      {
        type: { type: String, enum: ['SMS', 'EMAIL', 'IN_APP', 'WEBHOOK'], required: true },
        config: Schema.Types.Mixed,
      },
    ],
    isEnabled: { type: Boolean, default: true },
    schedule: String,
    retryPolicy: {
      attempts: { type: Number, default: 3 },
      backoff: { type: Number, default: 1000 },
    },
    lastRun: Date,
  },
  { timestamps: true }
);

export const Automation = mongoose.model<IAutomation>('Automation', AutomationSchema);
