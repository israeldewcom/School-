import mongoose, { Schema, Document } from 'mongoose';

export interface IFeeStructure extends Document {
  schoolId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  termId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  feeItems: Array<{
    categoryId: mongoose.Types.ObjectId;
    description: string;
    amount: number; // kobo
  }>;
  totalAmount: number; // kobo
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FeeStructureSchema = new Schema<IFeeStructure>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    feeItems: [
      {
        categoryId: { type: Schema.Types.ObjectId, ref: 'FeeCategory', required: true },
        description: { type: String, required: true },
        amount: { type: Number, required: true },
      },
    ],
    totalAmount: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const FeeStructure = mongoose.model<IFeeStructure>('FeeStructure', FeeStructureSchema);
