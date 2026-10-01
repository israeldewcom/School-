import mongoose, { Schema, Document } from 'mongoose';

export interface IStaff extends Document {
  schoolId: mongoose.Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: 'TEACHER' | 'ACCOUNTANT' | 'ADMIN' | 'OTHER';
  department?: string;
  photo?: string;
  // Teaching assignment. Synced to the linked login (User) so the teacher's
  // scope (which classes/subjects they can see and score) follows.
  subjectIds: mongoose.Types.ObjectId[];
  classIds: mongoose.Types.ObjectId[];
  formClassId?: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
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
    photo: String,
    subjectIds: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],
    classIds: [{ type: Schema.Types.ObjectId, ref: 'Class' }],
    formClassId: { type: Schema.Types.ObjectId, ref: 'Class' },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    hireDate: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Staff = mongoose.model<IStaff>('Staff', StaffSchema);
