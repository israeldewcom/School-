// src/models/ReportCardTemplate.ts
import mongoose, { Schema, Document } from 'mongoose';

export type TemplateField =
  | 'student_name'
  | 'admission_number'
  | 'class_name'
  | 'session'
  | 'term'
  | 'date_of_birth'
  | 'gender'
  | 'age'
  | 'average'
  | 'position'
  | 'grade'
  | 'class_size'
  | 'teacher_remark'
  | 'principal_remark'
  | 'attendance_present'
  | 'attendance_absent'
  | 'attendance_total'
  | 'next_term_begins'
  | 'school_name'
  | 'custom_text';

export interface ITemplatePin {
  field: TemplateField;
  x: number;              // 0-100, % from left
  y: number;              // 0-100, % from top
  size?: number;          // font size in points (default 11)
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  maxWidth?: number;      // 0-100, % of page width — for truncation
  customText?: string;    // used when field === 'custom_text'
}

export interface ITemplateTable {
  // Where the table starts — the top-left corner of the first row's
  // first column.
  x: number;
  y: number;
  // Column offsets from `x`, as % of page width. One entry per column.
  // For a 5-column table [subject, ca, exam, total, grade], this is
  // [0, 55, 68, 80, 90] meaning subject starts at x, ca at x+55% of
  // page width, etc.
  columnOffsets: number[];
  columns: Array<'subject' | 'ca' | 'exam' | 'total' | 'grade' | 'remark'>;
  rowHeight: number;      // % of page height between rows
  fontSize?: number;
  maxRows?: number;       // truncate beyond this
}

export interface IReportCardTemplate extends Document {
  schoolId: mongoose.Types.ObjectId;
  name: string;
  type: 'report_card' | 'receipt' | 'invoice';
  imageData: string;             // data URL
  pins: ITemplatePin[];
  tables: ITemplateTable[];
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PinSchema = new Schema<ITemplatePin>(
  {
    field: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    size: { type: Number, default: 11 },
    bold: { type: Boolean, default: false },
    align: { type: String, enum: ['left', 'center', 'right'], default: 'left' },
    maxWidth: { type: Number },
    customText: { type: String },
  },
  { _id: false }
);

const TableSchema = new Schema<ITemplateTable>(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    columnOffsets: { type: [Number], default: [] },
    columns: { type: [String], default: [] },
    rowHeight: { type: Number, default: 3 },
    fontSize: { type: Number, default: 10 },
    maxRows: { type: Number, default: 20 },
  },
  { _id: false }
);

const ReportCardTemplateSchema = new Schema<IReportCardTemplate>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['report_card', 'receipt', 'invoice'],
      default: 'report_card',
    },
    imageData: { type: String, required: true },
    pins: { type: [PinSchema], default: [] },
    tables: { type: [TableSchema], default: [] },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

ReportCardTemplateSchema.index({ schoolId: 1, type: 1, isActive: 1 });

export const ReportCardTemplate = mongoose.model<IReportCardTemplate>(
  'ReportCardTemplate',
  ReportCardTemplateSchema
);
