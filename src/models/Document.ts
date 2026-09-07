import mongoose, { Schema, Document } from 'mongoose';

export interface IDocument extends Document {
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

const DocumentSchema = new Schema<IDocument>(
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

export const Document = mongoose.model<IDocument>('Document', DocumentSchema);
