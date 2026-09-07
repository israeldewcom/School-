import mongoose, { Schema, Document } from 'mongoose';

export interface IClass extends Document {
  schoolId: mongoose.Types.ObjectId;
  name: string;
  level: number;
  homeroomTeacher?: mongoose.Types.ObjectId;
  academicYear: string;
  students: mongoose.Types.ObjectId[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ClassSchema = new Schema<IClass>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true },
    level: { type: Number, required: true },
    homeroomTeacher: { type: Schema.Types.ObjectId, ref: 'Staff' },
    academicYear: { type: String, required: true },
    students: [{ type: Schema.Types.ObjectId, ref: 'Student' }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Class = mongoose.model<IClass>('Class', ClassSchema);
