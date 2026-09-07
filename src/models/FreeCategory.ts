import mongoose, { Schema, Document } from 'mongoose';

export interface IFeeCategory extends Document {
  schoolId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FeeCategorySchema = new Schema<IFeeCategory>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true },
    description: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const FeeCategory = mongoose.model<IFeeCategory>('FeeCategory', FeeCategorySchema);
