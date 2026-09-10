import { Request, Response, NextFunction } from 'express';
import { PaymentService } from './payment.service';
import { Payment } from '../../models/Payment';
import { NotFoundError } from '../../utils/errors';

export class PaymentController {
  static async getPayments(req: Request, res: Response, next: NextFunction) {
    try {
      const payments = await Payment.find({ schoolId: req.schoolId, ...req.query })
        .populate('studentId')
        .populate('invoiceId');
      res.json({ success: true, data: payments });
    } catch (error) { next(error); }
  }

  static async getPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const payment = await Payment.findOne({ _id: req.params.id, schoolId: req.schoolId })
        .populate('studentId')
        .populate('invoiceId');
      if (!payment) throw new NotFoundError('Payment not found');
      res.json({ success: true, data: payment });
    } catch (error) { next(error); }
  }

  static async recordManual(req: Request, res: Response, next: NextFunction) {
    try {
      const data = {
        ...req.body,
        schoolId: req.schoolId,
        receivedBy: req.userId,
        proofFile: req.file, // multer-populated file, if one was attached
      };
      const payment = await PaymentService.recordManualPayment(data);
      res.status(201).json({ success: true, data: payment });
    } catch (error) { next(error); }
  }

  static async approveManual(req: Request, res: Response, next: NextFunction) {
    try {
      const payment = await PaymentService.approveManualPayment(req.params.id, req.userId!);
      res.json({ success: true, data: payment });
    } catch (error) { next(error); }
  }

  // ------------------------------------------------------------------
  // Whole-school receipt batch endpoints
  // ------------------------------------------------------------------

  // Kicks off background generation. Returns 202 + batchId immediately.
  static async generateReceiptsForSchool(req: Request, res: Response, next: NextFunction) {
    try {
      const batch = await PaymentService.generateReceiptsForSchool(req.schoolId!, req.userId!);
      res.status(202).json({ success: true, data: batch });
    } catch (error) { next(error); }
  }

  // Polled by the frontend for a progress bar (processedCount / totalCount).
  static async getReceiptBatch(req: Request, res: Response, next: NextFunction) {
    try {
      const batch = await PaymentService.getReceiptBatch(req.params.batchId, req.schoolId!);
      res.json({ success: true, data: batch });
    } catch (error) { next(error); }
  }

  // Returns one merged PDF of every receipt in the batch, ready to print.
  static async printReceiptBatch(req: Request, res: Response, next: NextFunction) {
    try {
      const pdfBuffer = await PaymentService.printReceiptBatch(req.params.batchId, req.schoolId!);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="receipts-batch-${req.params.batchId}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) { next(error); }
  }
}
