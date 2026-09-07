import mongoose, { Schema, Document } from 'mongoose';

export interface IStudent extends Document {
  schoolId: mongoose.Types.ObjectId;
  admissionNumber: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth: Date;
  gender: 'MALE' | 'FEMALE';
  classId: mongoose.Types.ObjectId;
  parentIds: mongoose.Types.ObjectId[];
  photo?: string;
  address: string;
  medicalInfo?: string;
  admissionDate: Date;
  status: 'ACTIVE' | 'GRADUATED' | 'TRANSFERRED' | 'SUSPENDED' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema = new Schema<IStudent>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    admissionNumber: { type: String, required: true },
    firstName: { type: String, required: true },
    middleName: String,
    lastName: { type: String, required: true },
    dateOfBirth: { type: Date, required: true },
    gender: { type: String, enum: ['MALE', 'FEMALE'], required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    parentIds: [{ type: Schema.Types.ObjectId, ref: 'Parent' }],
    photo: String,
    address: { type: String, required: true },
    medicalInfo: String,
    admissionDate: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['ACTIVE', 'GRADUATED', 'TRANSFERRED', 'SUSPENDED', 'ARCHIVED'],
      default: 'ACTIVE',
    },
  },
  { timestamps: true }
);

StudentSchema.index({ schoolId: 1, admissionNumber: 1 }, { unique: true });

export const Student = mongoose.model<IStudent>('Student', StudentSchema);
