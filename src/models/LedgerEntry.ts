import mongoose, { Schema, Document } from 'mongoose';

export interface ILedgerEntry extends Document {
  schoolId: mongoose.Types.ObjectId;
  invoiceId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  amount: number; // kobo
  type: 'DEBIT' | 'CREDIT';
  category: 'INVOICE' | 'PAYMENT' | 'DISCOUNT' | 'REFUND' | 'REVERSAL';
  description: string;
  reference?: string;
  createdAt: Date;
}

const LedgerEntrySchema = new Schema<ILedgerEntry>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['DEBIT', 'CREDIT'], required: true },
    category: {
      type: String,
      enum: ['INVOICE', 'PAYMENT', 'DISCOUNT', 'REFUND', 'REVERSAL'],
      required: true,
    },
    description: { type: String, required: true },
    reference: String,
  },
  { timestamps: true }
);

export const LedgerEntry = mongoose.model<ILedgerEntry>('LedgerEntry', LedgerEntrySchema);
