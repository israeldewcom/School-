import mongoose, { Schema, Document } from 'mongoose';

export interface IFeeStructure extends Document {
  schoolId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  termId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  feeItems: Array<{
    categoryId?: mongoose.Types.ObjectId;
    description: string;
    amount: number;
  }>;
  totalAmount: number;
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
        categoryId: { type: Schema.Types.ObjectId, ref: 'FeeCategory' },
        description: { type: String, required: true, trim: true },
        amount: { type: Number, required: true, min: 0 },
      },
    ],
    totalAmount: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Normalize empty-string categoryId to undefined before validation.
FeeStructureSchema.pre('validate', function (next) {
  if (Array.isArray(this.feeItems)) {
    for (const item of this.feeItems) {
      if ((item as any).categoryId === '' || (item as any).categoryId === null) {
        (item as any).categoryId = undefined;
      }
    }
  }
  next();
});

export const FeeStructure = mongoose.model<IFeeStructure>('FeeStructure', FeeStructureSchema);
