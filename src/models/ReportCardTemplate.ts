import mongoose, { Schema, Document } from 'mongoose';

export interface IReportCardTemplate extends Document {
  schoolId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  version: number;
  layout: 'A4_PORTRAIT' | 'A4_LANDSCAPE';
  config: {
    showLogo: boolean;
    showSchoolInfo: boolean;
    showStudentPhoto: boolean;
    showAttendance: boolean;
    showClassAverage: boolean;
    showSubjectAverage: boolean;
    showGrade: boolean;
    showRemark: boolean;
    showTeacherComment: boolean;
    showPrincipalComment: boolean;
    showSignature: boolean;
    showStamp: boolean;
    fields: Array<{
      key: string;
      label: string;
      type: 'text' | 'number' | 'date' | 'grade' | 'percentage';
      position: { x: number; y: number };
      style?: { fontSize?: number; fontWeight?: string; color?: string };
    }>;
    gradingConfig?: {
      gradingSystem: string;
      grades: Array<{ min: number; max: number; grade: string; remark: string }>;
    };
  };
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ReportCardTemplateSchema = new Schema<IReportCardTemplate>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true },
    description: String,
    version: { type: Number, default: 1 },
    layout: {
      type: String,
      enum: ['A4_PORTRAIT', 'A4_LANDSCAPE'],
      default: 'A4_PORTRAIT',
    },
    config: {
      showLogo: { type: Boolean, default: true },
      showSchoolInfo: { type: Boolean, default: true },
      showStudentPhoto: { type: Boolean, default: true },
      showAttendance: { type: Boolean, default: true },
      showClassAverage: { type: Boolean, default: true },
      showSubjectAverage: { type: Boolean, default: true },
      showGrade: { type: Boolean, default: true },
      showRemark: { type: Boolean, default: true },
      showTeacherComment: { type: Boolean, default: true },
      showPrincipalComment: { type: Boolean, default: true },
      showSignature: { type: Boolean, default: true },
      showStamp: { type: Boolean, default: true },
      fields: [
        {
          key: { type: String, required: true },
          label: { type: String, required: true },
          type: {
            type: String,
            enum: ['text', 'number', 'date', 'grade', 'percentage'],
            required: true,
          },
          position: {
            x: { type: Number, required: true },
            y: { type: Number, required: true },
          },
          style: {
            fontSize: Number,
            fontWeight: String,
            color: String,
          },
        },
      ],
      gradingConfig: {
        gradingSystem: String,
        grades: [
          {
            min: Number,
            max: Number,
            grade: String,
            remark: String,
          },
        ],
      },
    },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const ReportCardTemplate = mongoose.model<IReportCardTemplate>(
  'ReportCardTemplate',
  ReportCardTemplateSchema
);
