import { Invoice } from '../../models/Invoice';
import { Student } from '../../models/Student';
import { FeeStructure } from '../../models/FeeStructure';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { emailQueue } from '../../jobs/queues';
import { v4 as uuidv4 } from 'uuid';
import { setIdempotency, getIdempotency } from '../../config/redis';

export class InvoiceService {
  static async generateInvoice(data: { studentId: string; sessionId: string; termId: string; dueDate: Date, idempotencyKey?: string }) {
    // Idempotency check
    if (data.idempotencyKey) {
      const cached = await getIdempotency(`invoice:${data.idempotencyKey}`);
      if (cached) return cached;
    }

    const student = await Student.findById(data.studentId).populate('classId');
    if (!student) throw new NotFoundError('Student not found');

    const feeStructure = await FeeStructure.findOne({
      schoolId: student.schoolId,
      sessionId: data.sessionId,
      termId: data.termId,
      classId: student.classId,
    });
    if (!feeStructure) throw new BadRequestError('No fee structure for this class/term');

    const invoiceNumber = `INV-${Date.now()}-${uuidv4().slice(0, 6)}`;
    const subtotal = feeStructure.totalAmount;
    const discount = 0; // implement discount logic if needed
    const total = subtotal - discount;

    const invoice = new Invoice({
      schoolId: student.schoolId,
      studentId: student._id,
      sessionId: data.sessionId,
      termId: data.termId,
      invoiceNumber,
      items: feeStructure.feeItems.map((item: any) => ({
        description: item.description,
        amount: item.amount,
        categoryId: item.categoryId,
      })),
      subtotal,
      discount,
      total,
      amountPaid: 0,
      balance: total,
      dueDate: data.dueDate,
      status: 'ISSUED',
    });
    await invoice.save();

    // Store idempotency
    if (data.idempotencyKey) {
      await setIdempotency(`invoice:${data.idempotencyKey}`, invoice);
    }

    // Queue notification
    await emailQueue.add('send-invoice', { invoiceId: invoice._id });

    return invoice;
  }

  static async getById(id: string, schoolId: string) {
    const invoice = await Invoice.findOne({ _id: id, schoolId }).populate('studentId');
    if (!invoice) throw new NotFoundError('Invoice not found');
    return invoice;
  }

  static async getAll(schoolId: string, query: any) {
    return Invoice.find({ schoolId, ...query }).populate('studentId');
  }

  static async update(id: string, schoolId: string, data: any) {
    const invoice = await Invoice.findOneAndUpdate({ _id: id, schoolId }, data, { new: true });
    if (!invoice) throw new NotFoundError('Invoice not found');
    return invoice;
  }

  static async delete(id: string, schoolId: string) {
    const invoice = await Invoice.findOneAndDelete({ _id: id, schoolId });
    if (!invoice) throw new NotFoundError('Invoice not found');
    return invoice;
  }
}
