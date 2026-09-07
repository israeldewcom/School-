import mongoose, { Schema, Document } from 'mongoose';

export interface IPayment extends Document {
  schoolId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  invoiceId: mongoose.Types.ObjectId;
  amount: number; // kobo
  method: 'ONLINE' | 'BANK_TRANSFER' | 'CASH' | 'POS' | 'MANUAL';
  reference: string;
  providerTransactionId?: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REVERSED' | 'REFUNDED';
  receivedBy?: mongoose.Types.ObjectId;
  confirmedAt?: Date;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    amount: { type: Number, required: true },
    method: {
      type: String,
      enum: ['ONLINE', 'BANK_TRANSFER', 'CASH', 'POS', 'MANUAL'],
      required: true,
    },
    reference: { type: String, required: true, unique: true },
    providerTransactionId: String,
    status: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'FAILED', 'REVERSED', 'REFUNDED'],
      default: 'PENDING',
    },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    confirmedAt: Date,
    metadata: Schema.Types.Mixed,
  },
  { timestamps: true }
);

export const Payment = mongoose.model<IPayment>('Payment', PaymentSchema);
