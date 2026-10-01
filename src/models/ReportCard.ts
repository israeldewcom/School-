import mongoose, { Schema, Document } from 'mongoose';

export interface IReportCard extends Document {
  schoolId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  termId: mongoose.Types.ObjectId;
  classId?: mongoose.Types.ObjectId;
  templateId?: mongoose.Types.ObjectId;
  templateVersion: number;
  data: {
    student: {
      name: string;
      admissionNumber: string;
      class: string;
      photo?: string;
    };
    results: Array<{
      subject: string;
      ca: number;
      exam: number;
      total: number;
      grade: string;
      remark: string;
    }>;
    attendance: {
      present: number;
      absent: number;
      total: number;
      percentage: number;
    };
    classAverage: number;
    position?: number;
    classSize?: number;
    average?: number;
    grade?: string;
    sessionName?: string;
    termName?: string;
    nextTermBegins?: string;
    gender?: string;
    dateOfBirth?: string;
    teacherComment?: string;
    principalComment?: string;
    signature?: string;
    stamp?: string;
  };
  pdfUrl?: string;
  status: 'DRAFT' | 'GENERATED' | 'PUBLISHED' | 'ARCHIVED';
  generatedAt?: Date;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ReportCardSchema = new Schema<IReportCard>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', index: true },
    // Optional: schools that have not uploaded a template still get a
    // compiled card, rendered with the built-in layout.
    templateId: { type: Schema.Types.ObjectId, ref: 'ReportCardTemplate' },
    templateVersion: { type: Number, default: 1 },
    data: {
      student: {
        name: { type: String, required: true },
        admissionNumber: { type: String, required: true },
        class: { type: String, required: true },
        photo: String,
      },
      results: [
        {
          subject: { type: String, required: true },
          ca: Number,
          exam: Number,
          total: Number,
          grade: String,
          remark: String,
        },
      ],
      attendance: {
        present: { type: Number, default: 0 },
        absent: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        percentage: { type: Number, default: 0 },
      },
      classAverage: { type: Number, default: 0 },
      position: { type: Number },
      classSize: { type: Number },
      average: { type: Number },
      grade: String,
      sessionName: String,
      termName: String,
      nextTermBegins: String,
      gender: String,
      dateOfBirth: String,
      teacherComment: String,
      principalComment: String,
      signature: String,
      stamp: String,
    },
    pdfUrl: String,
    status: {
      type: String,
      enum: ['DRAFT', 'GENERATED', 'PUBLISHED', 'ARCHIVED'],
      default: 'DRAFT',
    },
    generatedAt: Date,
    publishedAt: Date,
  },
  { timestamps: true }
);

ReportCardSchema.index({ schoolId: 1, studentId: 1, sessionId: 1, termId: 1 }, { unique: true });
ReportCardSchema.index({ schoolId: 1, classId: 1, termId: 1, sessionId: 1 });

export const ReportCard = mongoose.model<IReportCard>('ReportCard', ReportCardSchema);
