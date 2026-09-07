import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  actor: string;
  schoolId?: mongoose.Types.ObjectId;
  action: string;
  resource: string;
  resourceId: string;
  before?: any;
  after?: any;
  ip?: string;
  userAgent?: string;
  timestamp: Date;
  requestId?: string;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actor: { type: String, required: true },
    schoolId: { type: Schema.Types.ObjectId, ref: 'School' },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: { type: String, required: true },
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    ip: String,
    userAgent: String,
    timestamp: { type: Date, default: Date.now },
    requestId: String,
  },
  { timestamps: true }
);

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
