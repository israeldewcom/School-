// src/models/HostelAllocation.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IHostelAllocation extends Document {
  schoolId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  hostelId: mongoose.Types.ObjectId;
  roomId: mongoose.Types.ObjectId;
  bedNumber?: number;
  status: 'ACTIVE' | 'CHECKED_OUT';
  checkInDate: Date;
  checkOutDate?: Date;
  sessionId?: mongoose.Types.ObjectId;
  termId?: mongoose.Types.ObjectId;
  feeAmount: number; // kobo
  invoiceId?: mongoose.Types.ObjectId;
  notes?: string;
  allocatedBy?: mongoose.Types.ObjectId;
  checkedOutBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const HostelAllocationSchema = new Schema<IHostelAllocation>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    hostelId: { type: Schema.Types.ObjectId, ref: 'Hostel', required: true, index: true },
    roomId: { type: Schema.Types.ObjectId, ref: 'HostelRoom', required: true, index: true },
    bedNumber: { type: Number, min: 1 },
    status: { type: String, enum: ['ACTIVE', 'CHECKED_OUT'], default: 'ACTIVE', index: true },
    checkInDate: { type: Date, default: Date.now },
    checkOutDate: { type: Date },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session' },
    termId: { type: Schema.Types.ObjectId, ref: 'Term' },
    feeAmount: { type: Number, default: 0, min: 0 },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    notes: { type: String, trim: true },
    allocatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    checkedOutBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// A student can hold only one ACTIVE bed at a time.
HostelAllocationSchema.index(
  { schoolId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' } }
);

// A bed can hold only one ACTIVE student at a time.
HostelAllocationSchema.index(
  { roomId: 1, bedNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'ACTIVE', bedNumber: { $exists: true } },
  }
);

export const HostelAllocation = mongoose.model<IHostelAllocation>(
  'HostelAllocation',
  HostelAllocationSchema
);
