import mongoose, { Schema, Document } from 'mongoose';

export interface ISubject extends Document {
  schoolId: mongoose.Types.ObjectId;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SubjectSchema = new Schema<ISubject>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true, trim: true },
    // Not required — the service auto-generates a code when missing.
    // Kept unique per school via the compound index below.
    code: { type: String, trim: true, uppercase: true },
    description: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SubjectSchema.index({ schoolId: 1, code: 1 }, { unique: true, sparse: true });

export const Subject = mongoose.model<ISubject>('Subject', SubjectSchema);
