// src/models/Invoice.ts
import mongoose, { Schema, Document } from 'mongoose';

export type InvoiceStatus =
  | 'ISSUED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'CANCELLED'
  | 'OVERDUE';

export interface IInvoiceItem {
  description: string;
  amount: number;
  categoryId?: mongoose.Types.ObjectId;
}

export interface IInvoice extends Document {
  schoolId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  classId?: mongoose.Types.ObjectId;
  sessionId?: mongoose.Types.ObjectId;
  termId?: mongoose.Types.ObjectId;
  invoiceNumber: string;
  total: number;
  amountPaid: number;
  balance: number;
  status: InvoiceStatus;
  dueDate?: Date;
  items: IInvoiceItem[];
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceSchema = new Schema<IInvoice>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session' },
    termId: { type: Schema.Types.ObjectId, ref: 'Term' },
    invoiceNumber: { type: String, required: true },
    total: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    balance: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'OVERDUE'],
      default: 'ISSUED',
      index: true,
    },
    dueDate: { type: Date },
    items: [
      {
        description: { type: String },
        amount: { type: Number },
        categoryId: { type: Schema.Types.ObjectId, ref: 'FeeCategory' },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Keep `balance` in sync with total - amountPaid.
InvoiceSchema.pre('save', function (next) {
  this.balance = Math.max((this.total || 0) - (this.amountPaid || 0), 0);
  // Auto-flip status as payments come in.
  if (this.status !== 'CANCELLED') {
    if (this.balance === 0 && this.total > 0) {
      this.status = 'PAID';
    } else if (this.amountPaid > 0) {
      this.status = 'PARTIALLY_PAID';
    }
  }
  next();
});

InvoiceSchema.index(
  { schoolId: 1, studentId: 1, sessionId: 1, termId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $ne: 'CANCELLED' },
      sessionId: { $exists: true },
      termId: { $exists: true },
    },
  }
);

InvoiceSchema.index({ schoolId: 1, invoiceNumber: 1 }, { unique: true });

export const Invoice = mongoose.model<IInvoice>('Invoice', InvoiceSchema);
