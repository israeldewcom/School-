import mongoose, { Schema, Document } from 'mongoose';

export interface ITerm extends Document {
  schoolId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  name: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TermSchema = new Schema<ITerm>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true },
    name: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Term = mongoose.model<ITerm>('Term', TermSchema);
