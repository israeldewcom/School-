// src/models/Student.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IStudent extends Document {
  schoolId: mongoose.Types.ObjectId;
  firstName: string;
  lastName: string;
  fullName: string;                    // ← added (was missing)
  admissionNumber: string;
  classId: mongoose.Types.ObjectId;
  parentIds: mongoose.Types.ObjectId[];
  gender?: string;
  dateOfBirth?: Date;
  address?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'GRADUATED' | 'DELETED';
  fees?: {
    expected?: number;
    paid?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema = new Schema<IStudent>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    fullName: { type: String, trim: true, index: true },
    admissionNumber: { type: String, required: true, trim: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    parentIds: [{ type: Schema.Types.ObjectId, ref: 'Parent' }],
    gender: { type: String, enum: ['MALE', 'FEMALE'], default: undefined },
    dateOfBirth: { type: Date },
    address: { type: String },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'GRADUATED', 'DELETED'],
      default: 'ACTIVE',
      index: true,
    },
    fees: {
      expected: { type: Number, default: 0 },
      paid: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

StudentSchema.index({ schoolId: 1, admissionNumber: 1 }, { unique: true });
StudentSchema.index({ schoolId: 1, classId: 1 });

// Keep fullName in sync whenever firstName or lastName changes.
StudentSchema.pre('save', function (next) {
  if (this.isModified('firstName') || this.isModified('lastName')) {
    this.fullName = `${this.firstName || ''} ${this.lastName || ''}`.trim();
  }
  next();
});

export const Student = mongoose.model<IStudent>('Student', StudentSchema);
