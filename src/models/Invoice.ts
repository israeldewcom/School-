import mongoose, { Schema, Document } from 'mongoose';

export interface IInvoice extends Document {
  schoolId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  termId: mongoose.Types.ObjectId;
  invoiceNumber: string;
  items: Array<{
    description: string;
    amount: number; // kobo
    categoryId?: mongoose.Types.ObjectId;
  }>;
  subtotal: number; // kobo
  discount: number; // kobo
  total: number; // kobo
  amountPaid: number; // kobo
  balance: number; // kobo
  dueDate: Date;
  status: 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceSchema = new Schema<IInvoice>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    invoiceNumber: { type: String, required: true, unique: true },
    items: [
      {
        description: { type: String, required: true },
        amount: { type: Number, required: true },
        categoryId: { type: Schema.Types.ObjectId, ref: 'FeeCategory' },
      },
    ],
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    balance: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'],
      default: 'DRAFT',
    },
  },
  { timestamps: true }
);

export const Invoice = mongoose.model<IInvoice>('Invoice', InvoiceSchema);
