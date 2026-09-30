// src/models/Hostel.ts
import mongoose, { Schema, Document } from 'mongoose';

export type HostelGender = 'BOYS' | 'GIRLS' | 'MIXED';

export interface IHostel extends Document {
  schoolId: mongoose.Types.ObjectId;
  name: string;
  gender: HostelGender;
  managerId?: mongoose.Types.ObjectId; // User with role HOSTEL_MANAGER
  feePerTerm: number; // kobo
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const HostelSchema = new Schema<IHostel>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true, trim: true },
    gender: { type: String, enum: ['BOYS', 'GIRLS', 'MIXED'], default: 'MIXED' },
    managerId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    feePerTerm: { type: Number, default: 0, min: 0 },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

HostelSchema.index({ schoolId: 1, name: 1 }, { unique: true });

export const Hostel = mongoose.model<IHostel>('Hostel', HostelSchema);
