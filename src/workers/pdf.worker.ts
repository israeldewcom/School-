import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { cloudinary } from '../integrations/storage/cloudinary';
import { renderReportCardPDF, renderReceiptPDF } from '../utils/pdfGenerator';
import { ReportCard } from '../models/ReportCard';
import { ReportCardTemplate } from '../models/ReportCardTemplate';
import { Student } from '../models/Student';
import { School } from '../models/School';
import { Payment } from '../models/Payment';
import { Invoice } from '../models/Invoice';

const uploadBuffer = (buffer: Buffer, folder: string, publicId: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id: publicId, resource_type: 'raw', format: 'pdf' },
      (error, result) => {
        if (error || !result) return reject(error || new Error('Cloudinary upload failed'));
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
};

const generateReportCardPdf = async (reportCardId: string) => {
  const reportCard = await ReportCard.findById(reportCardId);
  if (!reportCard) {
    logger.error(`generateReportCardPdf: report card ${reportCardId} not found`);
    return;
  }

  const template = await ReportCardTemplate.findById(reportCard.templateId);
  if (!template) {
    logger.error(`generateReportCardPdf: template ${reportCard.templateId} not found`);
    return;
  }

  const student = await Student.findById(reportCard.studentId);
  const school = await School.findById(reportCard.schoolId);
  if (!student || !school) {
    logger.error(`generateReportCardPdf: missing student or school for report card ${reportCardId}`);
    return;
  }

  const buffer = await renderReportCardPDF({
    template: { layout: template.layout, config: template.config as any },
    school: { name: school.name, address: school.address, phone: school.phone, logo: school.logo },
    data: reportCard.data as any,
  });

  const url = await uploadBuffer(
    buffer,
    `schools/${reportCard.schoolId}/report-cards`,
    `${reportCard._id}`
  );

  reportCard.pdfUrl = url;
  reportCard.status = 'GENERATED';
  reportCard.generatedAt = new Date();
  await reportCard.save();

  logger.info(`Report card PDF generated for ${reportCardId}`);
};

const generateReceiptPdf = async (paymentId: string) => {
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    logger.error(`generateReceiptPdf: payment ${paymentId} not found`);
    return;
  }

  const invoice = await Invoice.findById(payment.invoiceId).populate('studentId');
  const school = await School.findById(payment.schoolId);
  if (!invoice || !school) {
    logger.error(`generateReceiptPdf: missing invoice or school for payment ${paymentId}`);
    return;
  }

  const student: any = invoice.studentId;

  const buffer = await renderReceiptPDF({
    school: { name: school.name, address: school.address, phone: school.phone },
    payment: {
      reference: payment.reference,
      amount: payment.amount,
      method: payment.method,
      confirmedAt: payment.confirmedAt,
    },
    invoice: {
      invoiceNumber: invoice.invoiceNumber,
      total: invoice.total,
      amountPaid: invoice.amountPaid,
      balance: invoice.balance,
    },
    student: {
      name: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
    },
  });

  const url = await uploadBuffer(
    buffer,
    `schools/${payment.schoolId}/receipts`,
    `${payment._id}`
  );

  payment.receiptUrl = url;
  await payment.save();

  logger.info(`Receipt PDF generated for payment ${paymentId}`);
};

const worker = new Worker('schoolflow_pdf', async (job) => {
  const { reportCardId, paymentId } = job.data;
  if (reportCardId) {
    await generateReportCardPdf(reportCardId);
  } else if (paymentId) {
    await generateReceiptPdf(paymentId);
  }
}, {
  connection: redis,
  concurrency: 2,
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 1000 },
});

worker.on('failed', (job, err) => {
  logger.error(`PDF job ${job?.id} failed: ${err.message}`);
});

logger.info('PDF worker started');
