import mongoose, { Schema } from 'mongoose';

export interface ISchoolDocument extends mongoose.Document {
  schoolId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  fileUrl: string;
  mimeType: string;
  size: number;
  uploadedBy: mongoose.Types.ObjectId;
  tags: string[];
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema = new Schema<ISchoolDocument>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    title: { type: String, required: true },
    description: String,
    fileUrl: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tags: [String],
    isPublic: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const SchoolDocument = mongoose.model<ISchoolDocument>('Document', DocumentSchema);
