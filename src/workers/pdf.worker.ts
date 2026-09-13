// src/workers/pdf.worker.ts
import { Worker, Job } from 'bullmq';
import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { Student } from '../models/Student';
import { School } from '../models/School';
import { redis } from '../config/redis';
import logger from '../config/logger';

interface PdfJobData {
  paymentId: string;
  schoolId: string;
}

/**
 * Generate a receipt PDF for an approved payment and attach the URL
 * to the Payment document under `receiptUrl`. Idempotent — re-running
 * for an already-processed payment short-circuits.
 */
export async function generateReceipt(
  job: Job<PdfJobData>
): Promise<{ url: string }> {
  const { paymentId, schoolId } = job.data;

  if (!mongoose.isValidObjectId(paymentId)) {
    throw new Error(`Invalid paymentId: ${paymentId}`);
  }

  const payment = await Payment.findOne({ _id: paymentId, schoolId });
  if (!payment) throw new Error(`Payment not found: ${paymentId}`);

  if (payment.receiptUrl) {
    logger.info(`Receipt already exists for ${paymentId}`);
    return { url: payment.receiptUrl };
  }

  const [student, school] = await Promise.all([
    Student.findById(payment.studentId).lean(),
    School.findById(schoolId).lean(),
  ]);

  // IStudent doesn't expose a `fullName` field — it's a virtual on the
  // schema. Build the name from the raw fields with a safe fallback.
  const studentName = student
    ? `${(student as any).firstName || ''} ${(student as any).lastName || ''}`.trim() || '—'
    : '—';

  const pdfBuffer: Buffer = await renderReceiptPdf({
    schoolName: (school as any)?.name || 'School',
    studentName,
    amount: payment.amount,
    reference: payment.reference,
    receiptNo: payment.receiptNo || payment.reference,
    date: payment.approvedAt || payment.createdAt,
  });

  const url = await uploadReceiptBuffer(paymentId, pdfBuffer);

  payment.receiptUrl = url;
  payment.receiptGeneratedAt = new Date();
  await payment.save();

  logger.info(`Receipt generated for payment ${paymentId} → ${url}`);
  return { url };
}

// ------------------------------------------------------------------
// PDF rendering — replace with your actual receipt template. This
// version produces a valid PDF so the pipeline runs end-to-end.
// ------------------------------------------------------------------
async function renderReceiptPdf(data: {
  schoolName: string;
  studentName: string;
  amount: number;
  reference: string;
  receiptNo: string;
  date: Date;
}): Promise<Buffer> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4 portrait

  page.drawText(`${data.schoolName} — Receipt ${data.receiptNo}`, {
    x: 50,
    y: 780,
    size: 14,
  });
  page.drawText(`Student: ${data.studentName}`, { x: 50, y: 750, size: 11 });
  page.drawText(`Amount: ₦${(data.amount / 100).toLocaleString('en-NG')}`, {
    x: 50,
    y: 730,
    size: 11,
  });
  page.drawText(`Reference: ${data.reference}`, { x: 50, y: 710, size: 11 });
  page.drawText(`Date: ${data.date.toLocaleDateString('en-NG')}`, {
    x: 50,
    y: 690,
    size: 11,
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

// ------------------------------------------------------------------
// Upload — swap for S3/Cloudinary when ready. Stub returns a stable
// path so the worker pipeline runs without external credentials.
// ------------------------------------------------------------------
async function uploadReceiptBuffer(
  paymentId: string,
  buffer: Buffer
): Promise<string> {
  const filename = `receipts/${paymentId}.pdf`;
  logger.debug(`(stub) uploadReceiptBuffer → ${filename} (${buffer.length} bytes)`);
  return `/uploads/${filename}`;
}

// ------------------------------------------------------------------
// Worker registration
// ------------------------------------------------------------------
export function startPdfWorker(): Worker {
  const worker = new Worker<PdfJobData>(
    'pdf',
    async (job) => {
      if (job.name === 'generate-receipt') {
        return generateReceipt(job);
      }
      logger.warn(`pdf.worker: unknown job name "${job.name}"`);
      return {};
    },
    {
      connection: redis as any,
      concurrency: 4,
    }
  );

  worker.on('failed', (job: Job<PdfJobData> | undefined, error: Error) => {
    // Object first, message second — both the wrapper and native pino
    // accept this shape, so it's the safest call pattern.
    logger.error(
      { jobId: job?.id, message: error.message, stack: error.stack },
      'pdf.worker job failed'
    );
  });

  worker.on('completed', (job: Job<PdfJobData>, result: any) => {
    logger.info({ jobId: job.id, result }, 'pdf.worker job completed');
  });

  logger.info('PDF worker started');
  return worker;
}

export default startPdfWorker;
