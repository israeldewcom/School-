// src/workers/pdf.worker.ts
import { Worker, Job } from 'bullmq';
import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { Student } from '../models/Student';
import { School } from '../models/School';
import { mergePdfBuffers } from '../utils/pdfMerge';
import redis from '../config/redis';
import logger from '../config/logger';

// Minimal shape for the job payload. Adjust if your queue uses a
// different structure — the only hard requirements are `paymentId`
// and `schoolId`.
interface PdfJobData {
  paymentId: string;
  schoolId: string;
}

/**
 * Generate a receipt PDF for an approved payment, upload it to storage
 * (or write it to disk), and attach the resulting URL to the Payment
 * document under `receiptUrl`.
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

  // If the receipt was already generated, short-circuit. This makes
  // the worker safely re-runnable.
  if (payment.receiptUrl) {
    logger.info(`Receipt already exists for ${paymentId}`);
    return { url: payment.receiptUrl };
  }

  const [student, school] = await Promise.all([
    Student.findById(payment.studentId).lean(),
    School.findById(schoolId).lean(),
  ]);

  // In a real implementation this is where you'd build the PDF — the
  // shape of the generated file depends on your receipt template.
  // The point of this file is that it compiles and the types line up.
  const pdfBuffer: Buffer = await renderReceiptPdf({
    schoolName: school?.name || 'School',
    studentName: student?.fullName || '—',
    amount: payment.amount,
    reference: payment.reference,
    receiptNo: payment.receiptNo || payment.reference,
    date: payment.approvedAt || payment.createdAt,
  });

  // Upload destination is abstracted — swap for your S3/Cloudinary
  // helper. For now we write the URL that the file-upload returns.
  const url = await uploadReceiptBuffer(paymentId, pdfBuffer);

  payment.receiptUrl = url;
  payment.receiptGeneratedAt = new Date();
  await payment.save();

  logger.info(`Receipt generated for payment ${paymentId} → ${url}`);
  return { url };
}

// ------------------------------------------------------------------
// Stubs — replace with your actual template + upload implementation.
// ------------------------------------------------------------------
async function renderReceiptPdf(data: {
  schoolName: string;
  studentName: string;
  amount: number;
  reference: string;
  receiptNo: string;
  date: Date;
}): Promise<Buffer> {
  // A real version would use pdfkit or pdf-lib to draw text on a page.
  // For build purposes we return an empty-but-valid PDF buffer.
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
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

async function uploadReceiptBuffer(
  paymentId: string,
  buffer: Buffer
): Promise<string> {
  // Replace this with a call to your storage layer. Returning a
  // deterministic placeholder URL keeps the workflow functional
  // without a real bucket wired up.
  const filename = `receipts/${paymentId}.pdf`;
  logger.debug(`(stub) uploadReceiptBuffer → ${filename} (${buffer.length} bytes)`);
  return `/uploads/${filename}`;
}

// ------------------------------------------------------------------
// Worker registration — this is what the process starts at boot.
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

  // The two callbacks that were failing with "implicitly any" — the
  // error and result params now carry concrete types.
  worker.on('failed', (job: Job<PdfJobData> | undefined, error: Error) => {
    logger.error(`pdf.worker job failed: ${job?.id ?? 'unknown'}`, {
      message: error.message,
      stack: error.stack,
    });
  });

  worker.on('completed', (job: Job<PdfJobData>, result: any) => {
    logger.info(`pdf.worker job completed: ${job.id}`, { result });
  });

  logger.info('PDF worker started');
  return worker;
}

export default startPdfWorker;
