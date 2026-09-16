// src/models/Subject.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface ISubject extends Document {
  schoolId: mongoose.Types.ObjectId;
  name: string;
  code: string;
  description?: string;
  // Which classes offer this subject. Empty array means "available to
  // every class" — that keeps subjects created before this field
  // existed working without any migration.
  classIds: mongoose.Types.ObjectId[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SubjectSchema = new Schema<ISubject>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, uppercase: true },
    description: String,
    classIds: [{ type: Schema.Types.ObjectId, ref: 'Class', index: true }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SubjectSchema.index({ schoolId: 1, code: 1 }, { unique: true, sparse: true });
SubjectSchema.index({ schoolId: 1, classIds: 1 });

export const Subject = mongoose.model<ISubject>('Subject', SubjectSchema);
