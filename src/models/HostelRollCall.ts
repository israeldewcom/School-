// src/models/HostelRollCall.ts
import mongoose, { Schema, Document } from 'mongoose';

export type RollCallStatus = 'PRESENT' | 'ABSENT' | 'ON_LEAVE' | 'SICK';

export interface IHostelRollCall extends Document {
  schoolId: mongoose.Types.ObjectId;
  hostelId: mongoose.Types.ObjectId;
  date: Date; // midnight-normalized
  type: 'NIGHT' | 'MORNING';
  records: Array<{ studentId: mongoose.Types.ObjectId; status: RollCallStatus; note?: string }>;
  takenBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const HostelRollCallSchema = new Schema<IHostelRollCall>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    hostelId: { type: Schema.Types.ObjectId, ref: 'Hostel', required: true },
    date: { type: Date, required: true },
    type: { type: String, enum: ['NIGHT', 'MORNING'], default: 'NIGHT' },
    records: [
      {
        studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
        status: {
          type: String,
          enum: ['PRESENT', 'ABSENT', 'ON_LEAVE', 'SICK'],
          default: 'PRESENT',
        },
        note: { type: String, trim: true },
        _id: false,
      },
    ],
    takenBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

HostelRollCallSchema.index({ hostelId: 1, date: 1, type: 1 }, { unique: true });

export const HostelRollCall = mongoose.model<IHostelRollCall>('HostelRollCall', HostelRollCallSchema);
