// src/models/GradeScale.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IGradeBand {
  min: number; // inclusive
  max: number; // inclusive
  grade: string;
  remark: string;
  point?: number;
}

export interface IGradeScale extends Document {
  schoolId: mongoose.Types.ObjectId;
  caMax: number;
  examMax: number;
  passMark: number;
  bands: IGradeBand[];
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Matches the scale the report card service already uses, so grades on
// report cards and on result entry agree out of the box.
export const DEFAULT_BANDS: IGradeBand[] = [
  { min: 75, max: 100, grade: 'A', remark: 'Excellent', point: 5 },
  { min: 65, max: 74.99, grade: 'B', remark: 'Very Good', point: 4 },
  { min: 55, max: 64.99, grade: 'C', remark: 'Good', point: 3 },
  { min: 45, max: 54.99, grade: 'D', remark: 'Fair', point: 2 },
  { min: 40, max: 44.99, grade: 'E', remark: 'Pass', point: 1 },
  { min: 0, max: 39.99, grade: 'F', remark: 'Fail', point: 0 },
];

const BandSchema = new Schema<IGradeBand>(
  {
    min: { type: Number, required: true, min: 0, max: 100 },
    max: { type: Number, required: true, min: 0, max: 100 },
    grade: { type: String, required: true, trim: true },
    remark: { type: String, required: true, trim: true },
    point: { type: Number },
  },
  { _id: false }
);

const GradeScaleSchema = new Schema<IGradeScale>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, unique: true },
    caMax: { type: Number, default: 40, min: 0, max: 100 },
    examMax: { type: Number, default: 60, min: 0, max: 100 },
    passMark: { type: Number, default: 40, min: 0, max: 100 },
    bands: { type: [BandSchema], default: () => DEFAULT_BANDS },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const GradeScale = mongoose.model<IGradeScale>('GradeScale', GradeScaleSchema);
