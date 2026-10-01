// src/services/financeSync.service.ts
import mongoose from 'mongoose';
import { Invoice } from '../models/Invoice';
import { Student } from '../models/Student';
import logger from '../config/logger';

export interface FeeSnapshot {
  expected: number;
  paid: number;
  owed: number;
  status: 'PAID' | 'PARTIAL' | 'OUTSTANDING';
}

export function feeStatus(expected: number, paid: number): FeeSnapshot['status'] {
  if (expected <= 0) return 'OUTSTANDING';
  if (paid >= expected) return 'PAID';
  if (paid > 0) return 'PARTIAL';
  return 'OUTSTANDING';
}

/**
 * Recompute a student's fee totals from their invoices and store them on the
 * student document, so dashboards that read `student.fees` are never stale
 * after a payment, reversal or new invoice.
 */
export async function syncStudentFees(schoolId: string, studentId: string): Promise<FeeSnapshot | null> {
  try {
    const rows = await Invoice.aggregate([
      {
        $match: {
          schoolId: new mongoose.Types.ObjectId(schoolId),
          studentId: new mongoose.Types.ObjectId(studentId),
          status: { $ne: 'CANCELLED' },
        },
      },
      { $group: { _id: null, expected: { $sum: '$total' }, paid: { $sum: '$amountPaid' } } },
    ]);
    const expected = rows[0]?.expected || 0;
    const paid = rows[0]?.paid || 0;
    await Student.updateOne({ _id: studentId, schoolId }, { $set: { 'fees.expected': expected, 'fees.paid': paid } });
    return { expected, paid, owed: Math.max(expected - paid, 0), status: feeStatus(expected, paid) };
  } catch (err: any) {
    logger.warn(`syncStudentFees failed for ${studentId}: ${err?.message}`);
    return null;
  }
}
