import mongoose, { Schema, Document } from 'mongoose';

export interface IStaff extends Document {
  schoolId: mongoose.Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: 'TEACHER' | 'ACCOUNTANT' | 'ADMIN' | 'OTHER';
  department?: string;
  hireDate: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StaffSchema = new Schema<IStaff>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    role: {
      type: String,
      enum: ['TEACHER', 'ACCOUNTANT', 'ADMIN', 'OTHER'],
      required: true,
    },
    department: String,
    hireDate: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Staff = mongoose.model<IStaff>('Staff', StaffSchema);
