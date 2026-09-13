// src/models/Payment.ts
import mongoose, { Schema, Document } from 'mongoose';

export type PaymentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CONFIRMED'
  | 'FAILED'
  | 'REVERSED'
  | 'REFUNDED';

export type PaymentMethod =
  | 'CASH'
  | 'BANK_TRANSFER'
  | 'POS'
  | 'ONLINE'
  | 'MANUAL'
  | 'CHEQUE'
  | 'CARD'
  | 'OTHER';

export interface IPayment extends Document {
  schoolId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  invoiceId?: mongoose.Types.ObjectId;
  amount: number; // kobo
  method: PaymentMethod | string;
  reference: string;
  status: PaymentStatus;

  submittedBy?: string;

  approvedAt?: Date;
  approvedBy?: mongoose.Types.ObjectId | string;

  rejectedAt?: Date;
  rejectedBy?: mongoose.Types.ObjectId | string;
  rejectionReason?: string;

  // Receipt metadata — populated by the PDF worker after approval.
  receiptNo?: string;
  receiptUrl?: string;      // ← new — was causing pdf.worker.ts TS2339
  receiptGeneratedAt?: Date;

  // Provider fields (Paystack/Flutterwave integration).
  provider?: string;
  providerReference?: string;
  providerPayload?: any;
  confirmedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', index: true },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, required: true, default: 'CASH' },
    reference: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'CONFIRMED', 'FAILED', 'REVERSED', 'REFUNDED'],
      default: 'PENDING',
      index: true,
    },

    submittedBy: { type: String },

    approvedAt: { type: Date },
    approvedBy: { type: Schema.Types.Mixed },

    rejectedAt: { type: Date },
    rejectedBy: { type: Schema.Types.Mixed },
    rejectionReason: { type: String },

    receiptNo: { type: String, index: true },
    receiptUrl: { type: String },
    receiptGeneratedAt: { type: Date },

    provider: { type: String },
    providerReference: { type: String, index: true },
    providerPayload: { type: Schema.Types.Mixed },
    confirmedAt: { type: Date },
  },
  { timestamps: true }
);

PaymentSchema.index({ schoolId: 1, reference: 1 }, { unique: true, sparse: true });
PaymentSchema.index({ schoolId: 1, status: 1, createdAt: -1 });

export const Payment = mongoose.model<IPayment>('Payment', PaymentSchema);
