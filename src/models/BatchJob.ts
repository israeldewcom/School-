import mongoose, { Schema, Document } from 'mongoose';

// Tracks a whole-school bulk operation (report card generation or receipt
// generation) so the frontend can show real progress instead of a blocking
// spinner on a request that could take minutes for a large school.
export interface IBatchJob extends Document {
  schoolId: mongoose.Types.ObjectId;
  type: 'REPORT_CARDS' | 'RECEIPTS';
  sessionId?: mongoose.Types.ObjectId;
  termId?: mongoose.Types.ObjectId;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalCount: number;
  processedCount: number;
  successCount: number;
  failureCount: number;
  itemIds: mongoose.Types.ObjectId[]; // ReportCard._id[] or Payment._id[]
  failures: Array<{ studentId?: string; reason: string }>;
  startedBy: mongoose.Types.ObjectId;
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BatchJobSchema = new Schema<IBatchJob>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    type: { type: String, enum: ['REPORT_CARDS', 'RECEIPTS'], required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session' },
    termId: { type: Schema.Types.ObjectId, ref: 'Term' },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
    },
    totalCount: { type: Number, default: 0 },
    processedCount: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    failureCount: { type: Number, default: 0 },
    itemIds: [{ type: Schema.Types.ObjectId }],
    failures: [
      {
        studentId: String,
        reason: String,
      },
    ],
    startedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    startedAt: { type: Date, default: Date.now },
    completedAt: Date,
  },
  { timestamps: true }
);

export const BatchJob = mongoose.model<IBatchJob>('BatchJob', BatchJobSchema);
