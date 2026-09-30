// src/models/AdmissionApplication.ts
import mongoose, { Schema, Document } from 'mongoose';

export type AdmissionStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'INTERVIEW_SCHEDULED'
  | 'ADMITTED'
  | 'WAITLISTED'
  | 'REJECTED'
  | 'ENROLLED'
  | 'WITHDRAWN';

export const ADMISSION_STATUSES: AdmissionStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'INTERVIEW_SCHEDULED',
  'ADMITTED',
  'WAITLISTED',
  'REJECTED',
  'ENROLLED',
  'WITHDRAWN',
];

export interface IAdmissionApplication extends Document {
  schoolId: mongoose.Types.ObjectId;
  applicationNumber: string;
  status: AdmissionStatus;
  applicant: {
    firstName: string;
    lastName: string;
    gender?: 'MALE' | 'FEMALE';
    dateOfBirth?: Date;
    previousSchool?: string;
    address?: string;
  };
  classAppliedId?: mongoose.Types.ObjectId;
  classAppliedName?: string;
  parent: {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    relationship?: string;
    address?: string;
  };
  source: 'ONLINE' | 'OFFICE';
  interview?: { date?: Date; location?: string; notes?: string };
  decision?: { reason?: string; by?: mongoose.Types.ObjectId; at?: Date };
  notes: Array<{ text: string; by?: mongoose.Types.ObjectId; byName?: string; at: Date }>;
  history: Array<{ status: AdmissionStatus; by?: mongoose.Types.ObjectId; byName?: string; at: Date; note?: string }>;
  studentId?: mongoose.Types.ObjectId;
  submittedAt: Date;
  submittedIp?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdmissionApplicationSchema = new Schema<IAdmissionApplication>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    applicationNumber: { type: String, required: true },
    status: { type: String, enum: ADMISSION_STATUSES, default: 'SUBMITTED', index: true },
    applicant: {
      firstName: { type: String, required: true, trim: true },
      lastName: { type: String, required: true, trim: true },
      gender: { type: String, enum: ['MALE', 'FEMALE'], default: undefined },
      dateOfBirth: { type: Date },
      previousSchool: { type: String, trim: true },
      address: { type: String, trim: true },
    },
    classAppliedId: { type: Schema.Types.ObjectId, ref: 'Class' },
    classAppliedName: { type: String, trim: true },
    parent: {
      firstName: { type: String, required: true, trim: true },
      lastName: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      email: { type: String, trim: true, lowercase: true },
      relationship: { type: String, trim: true, default: 'Guardian' },
      address: { type: String, trim: true },
    },
    source: { type: String, enum: ['ONLINE', 'OFFICE'], default: 'ONLINE' },
    interview: {
      date: { type: Date },
      location: { type: String, trim: true },
      notes: { type: String, trim: true },
    },
    decision: {
      reason: { type: String, trim: true },
      by: { type: Schema.Types.ObjectId, ref: 'User' },
      at: { type: Date },
    },
    notes: [
      {
        text: { type: String, required: true },
        by: { type: Schema.Types.ObjectId, ref: 'User' },
        byName: { type: String },
        at: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    history: [
      {
        status: { type: String, enum: ADMISSION_STATUSES, required: true },
        by: { type: Schema.Types.ObjectId, ref: 'User' },
        byName: { type: String },
        at: { type: Date, default: Date.now },
        note: { type: String },
        _id: false,
      },
    ],
    studentId: { type: Schema.Types.ObjectId, ref: 'Student' },
    submittedAt: { type: Date, default: Date.now },
    submittedIp: { type: String },
  },
  { timestamps: true }
);

AdmissionApplicationSchema.index({ schoolId: 1, applicationNumber: 1 }, { unique: true });
AdmissionApplicationSchema.index({ schoolId: 1, status: 1, submittedAt: -1 });
AdmissionApplicationSchema.index({ schoolId: 1, 'parent.phone': 1 });

export const AdmissionApplication = mongoose.model<IAdmissionApplication>(
  'AdmissionApplication',
  AdmissionApplicationSchema
);
