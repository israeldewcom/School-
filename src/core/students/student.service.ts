// src/core/students/student.service.ts
import mongoose from 'mongoose';
import { Student } from '../../models/Student';
import { Class } from '../../models/Class';
import { Invoice } from '../../models/Invoice';
import { Payment } from '../../models/Payment';
import logger from '../../config/logger';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';
import { normalizeImageField, saveImage } from '../../services/storage.service';
import { syncStudentFees } from '../../services/financeSync.service';

export class StudentService {
  private static shape(s: any, feeTotals?: { expected: number; paid: number }) {
    const primaryParent = Array.isArray(s.parentIds) ? s.parentIds[0] : null;
    const className = s.classId?.name || '—';

    const expected = feeTotals?.expected ?? 0;
    const paid = feeTotals?.paid ?? 0;

    // NO_INVOICE (nothing billed yet) is no longer shown as "Outstanding".
    // OVERPAID covers credit balances. Everything else is driven by the real numbers.
    const status =
      expected === 0
        ? paid > 0
          ? 'OVERPAID'
          : 'NO_INVOICE'
        : paid >= expected
          ? paid > expected
            ? 'OVERPAID'
            : 'PAID'
          : paid > 0
            ? 'PARTIAL'
            : 'OUTSTANDING';

    return {
      id: String(s._id),
      fullName:
        s.fullName ||
        `${s.firstName || ''} ${s.lastName || ''}`.trim() ||
        'Unnamed student',
      firstName: s.firstName || '',
      lastName: s.lastName || '',
      admissionNumber: s.admissionNumber || '',
      gender: s.gender || '',
      dateOfBirth: s.dateOfBirth || null,
      address: s.address || '',
      photo: s.photo || null,
      className,
      classId: s.classId?._id ? String(s.classId._id) : (s.classId ? String(s.classId) : null),
      guardian: primaryParent
        ? `${primaryParent.firstName || ''} ${primaryParent.lastName || ''}`.trim()
        : '',
      guardianPhone: primaryParent?.phone || '',
      guardianEmail: primaryParent?.email || '',
      parentIds: (s.parentIds || []).map((p: any) => (p._id ? String(p._id) : String(p))),
      fees: { expected, paid, owed: Math.max(expected - paid, 0), status },
      createdAt: s.createdAt,
    };
  }

  /**
   * Sum expected/paid per student from ONE source of truth: the non-cancelled invoices.
   * invoice.amountPaid is updated atomically whenever a payment is approved/confirmed,
   * so "paid" can never disagree with "expected" (the old code summed Payment documents
   * separately, which included payments on cancelled invoices and drifted from invoices).
   * Pass { sessionId, termId } to restrict to one term; omitted = all billed terms.
   */
  private static async feeTotalsForStudents(
    schoolId: string,
    studentIds: string[],
    scope: { sessionId?: string; termId?: string } = {}
  ) {
    const result = new Map<string, { expected: number; paid: number }>();
    if (studentIds.length === 0) return result;

    const objectIds = studentIds.map((id) => new mongoose.Types.ObjectId(id));
    const filter: any = {
      schoolId,
      studentId: { $in: objectIds },
      status: { $nin: ['CANCELLED', 'DRAFT'] },
    };
    if (scope.sessionId && mongoose.isValidObjectId(scope.sessionId)) filter.sessionId = scope.sessionId;
    if (scope.termId && mongoose.isValidObjectId(scope.termId)) filter.termId = scope.termId;

    try {
      const invoices = await Invoice.find(filter).select('studentId total amountPaid').lean();
      for (const inv of invoices as any[]) {
        const sid = String(inv.studentId);
        const cur = result.get(sid) || { expected: 0, paid: 0 };
        cur.expected += inv.total || 0;
        cur.paid += inv.amountPaid || 0;
        result.set(sid, cur);
      }
    } catch (err: any) {
      logger.warn(`feeTotals: invoice query failed — ${err?.message}`);
    }

    // Safety net: approved payments that are NOT attached to any invoice still count as paid.
    try {
      const orphan: any[] = await Payment.find({
        schoolId,
        studentId: { $in: objectIds },
        status: { $in: ['APPROVED', 'CONFIRMED'] },
        $or: [{ invoiceId: { $exists: false } }, { invoiceId: null }],
      }).select('studentId amount').lean();
      for (const p of orphan) {
        const sid = String(p.studentId);
        const cur = result.get(sid) || { expected: 0, paid: 0 };
        cur.paid += p.amount || 0;
        result.set(sid, cur);
      }
    } catch (err: any) {
      logger.warn(`feeTotals: orphan payment query failed — ${err?.message}`);
    }

    return result;
  }

  static async list(schoolId: string, query: any = {}) {
    const filter: any = { schoolId, status: { $ne: 'DELETED' } };
    if (query?.classId && mongoose.isValidObjectId(query.classId)) {
      filter.classId = query.classId;
    }

    const students = await Student.find(filter)
      .populate('classId', 'name')
      .populate('parentIds', 'firstName lastName phone email')
      .sort({ createdAt: -1 })
      .lean();

    const ids = students.map((s: any) => String(s._id));
    const feeMap = await StudentService.feeTotalsForStudents(schoolId, ids, {
      sessionId: query?.sessionId,
      termId: query?.termId,
    });

    return students.map((s: any) => StudentService.shape(s, feeMap.get(String(s._id))));
  }

  static async getAll(schoolId: string, query: any = {}) {
    return StudentService.list(schoolId, query);
  }

  static async getById(schoolId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid student id');
    const student = await Student.findOne({ _id: id, schoolId })
      .populate('classId', 'name')
      .populate('parentIds', 'firstName lastName phone email')
      .lean();
    if (!student) throw new NotFoundError('Student not found');
    const feeMap = await StudentService.feeTotalsForStudents(schoolId, [id]);
    return StudentService.shape(student, feeMap.get(id));
  }

  static async create(schoolId: string, data: any) {
    if (!data?.firstName || !String(data.firstName).trim()) {
      throw new BadRequestError('First name is required');
    }
    if (!data?.lastName || !String(data.lastName).trim()) {
      throw new BadRequestError('Last name is required');
    }
    if (!data?.admissionNumber || !String(data.admissionNumber).trim()) {
      throw new BadRequestError('Admission number is required');
    }
    if (!data?.classId || !mongoose.isValidObjectId(data.classId)) {
      throw new BadRequestError('Please select a class for this student.');
    }

    const cls = await Class.findOne({ _id: data.classId, schoolId });
    if (!cls) throw new BadRequestError('Class not found in this school.');

    const dup = await Student.findOne({
      schoolId,
      admissionNumber: String(data.admissionNumber).trim(),
    });
    if (dup) {
      throw new BadRequestError('A student with that admission number already exists.');
    }

    const payload: any = {
      schoolId,
      firstName: String(data.firstName).trim(),
      lastName: String(data.lastName).trim(),
      fullName: `${String(data.firstName).trim()} ${String(data.lastName).trim()}`,
      admissionNumber: String(data.admissionNumber).trim(),
      classId: data.classId,
      gender: data.gender || undefined,
      address: data.address || undefined,
      parentIds: Array.isArray(data.parentIds)
        ? data.parentIds.filter((p: any) => mongoose.isValidObjectId(p))
        : [],
      status: 'ACTIVE',
    };

    if (data.dateOfBirth) payload.dateOfBirth = new Date(data.dateOfBirth);
    if (data.photo) payload.photo = await normalizeImageField(data.photo, 'students');

    const student = new Student(payload);
    await student.save();

    await StudentService.autoInvoiceForStudent(schoolId, String(student._id), data.classId);
    await syncStudentFees(schoolId, String(student._id));

    return StudentService.getById(schoolId, String(student._id));
  }

  /**
   * Create the student's initial invoice from the class fee structure.
   *
   * Deduplication is strict: if any non-cancelled invoice already
   * exists for this student + session + term, we skip. This prevents
   * the 100x inflation bug where every save created a new invoice.
   */
  private static async autoInvoiceForStudent(
    schoolId: string,
    studentId: string,
    classId: string
  ) {
    try {
      const FeeStructure = mongoose.model('FeeStructure');
      const structure: any = await FeeStructure.findOne({
        schoolId,
        classId,
        isActive: true,
      })
        .sort({ createdAt: -1 })
        .lean();

      if (!structure) {
        logger.warn(
          `autoInvoice: no fee structure for class ${classId}; student ${studentId} has no invoice`
        );
        return;
      }

      // STRICT dedupe: any non-cancelled invoice with the same session
      // and term means we've already billed this student.
      const existing = await Invoice.findOne({
        schoolId,
        studentId,
        sessionId: structure.sessionId,
        termId: structure.termId,
        status: { $ne: 'CANCELLED' },
      });

      if (existing) {
        logger.info(
          `autoInvoice: student ${studentId} already has invoice for session/term, skipping`
        );
        return;
      }

      const seq = `${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
      const totalAmount = Number(structure.totalAmount) || 0;

      await Invoice.create({
        schoolId,
        studentId,
        classId,
        sessionId: structure.sessionId,
        termId: structure.termId,
        invoiceNumber: `INV-${seq}`,
        total: totalAmount,
        amountPaid: 0,
        status: 'ISSUED',
        dueDate: new Date(Date.now() + 30 * 86400000),
        items: (structure.feeItems || []).map((it: any) => ({
          description: it.description || it.name || 'Fee',
          amount: Number(it.amount) || 0,
          categoryId: it.categoryId,
        })),
      });
      logger.info(`Auto-invoiced student ${studentId} for ₦${(totalAmount / 100).toFixed(2)}`);
    } catch (err: any) {
      // Duplicate key error means the invoice already exists — that's
      // success, not failure.
      if (err?.code === 11000) {
        logger.info(`autoInvoice: student ${studentId} already invoiced (dup key)`);
        return;
      }
      logger.warn(`Auto-invoice failed for ${studentId}: ${err?.message}`);
    }
  }

  static async update(schoolId: string, id: string, data: any) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid student id');
    const student = await Student.findOne({ _id: id, schoolId });
    if (!student) throw new NotFoundError('Student not found');

    if (data.firstName !== undefined) student.firstName = String(data.firstName).trim();
    if (data.lastName !== undefined) student.lastName = String(data.lastName).trim();
    if (student.firstName || student.lastName) {
      student.fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
    }
    if (data.admissionNumber !== undefined) {
      student.admissionNumber = String(data.admissionNumber).trim();
    }
    if (data.classId !== undefined) {
      if (!mongoose.isValidObjectId(data.classId)) {
        throw new BadRequestError('Invalid class id');
      }
      const cls = await Class.findOne({ _id: data.classId, schoolId });
      if (!cls) throw new BadRequestError('Class not found');
      student.classId = data.classId;
    }
    if (data.gender !== undefined) student.gender = data.gender;
    if (data.dateOfBirth !== undefined) {
      if (data.dateOfBirth) student.dateOfBirth = new Date(data.dateOfBirth);
      else student.set('dateOfBirth', undefined);
    }
    if (data.address !== undefined) student.address = data.address;
    if (data.photo !== undefined) student.photo = (await normalizeImageField(data.photo, 'students')) || undefined;

    // Merge parentIds — add, don't replace. This is what makes the
    // "guardian created with student" flow actually link.
    if (data.parentIds !== undefined && Array.isArray(data.parentIds)) {
      const existing = new Set((student.parentIds || []).map((p: any) => String(p)));
      for (const p of data.parentIds) {
        if (mongoose.isValidObjectId(p)) existing.add(String(p));
      }
      student.parentIds = [...existing].map((s) => new mongoose.Types.ObjectId(s)) as any;
    }

    await student.save();
    return StudentService.getById(schoolId, id);
  }

  /** Store a photo (base64 data URL) and return its URL without touching any student (used while capturing a new student). */
  static async uploadPhotoOnly(dataUrl: string) {
    if (!dataUrl) throw new BadRequestError('photo (base64 data URL) is required');
    return { url: await saveImage({ dataUrl, folder: 'students' }) };
  }

  /** Set a student's passport photo from a data URL or a multer-saved file URL. */
  static async setPhoto(schoolId: string, id: string, photo: string) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid student id');
    const student = await Student.findOne({ _id: id, schoolId });
    if (!student) throw new NotFoundError('Student not found');
    const url = await normalizeImageField(photo, 'students');
    if (!url) throw new BadRequestError('photo is required');
    student.photo = url;
    await student.save();
    return StudentService.getById(schoolId, id);
  }

  static async linkParent(schoolId: string, studentId: string, parentId: string) {
    if (!mongoose.isValidObjectId(studentId)) throw new BadRequestError('Invalid student id');
    if (!mongoose.isValidObjectId(parentId)) throw new BadRequestError('Invalid parent id');
    const student = await Student.findOne({ _id: studentId, schoolId });
    if (!student) throw new NotFoundError('Student not found');
    const existing = new Set((student.parentIds || []).map((p: any) => String(p)));
    existing.add(parentId);
    student.parentIds = [...existing].map((s) => new mongoose.Types.ObjectId(s)) as any;
    await student.save();
    return StudentService.getById(schoolId, studentId);
  }

  static async delete(schoolId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid student id');
    const student = await Student.findOneAndDelete({ _id: id, schoolId });
    if (!student) throw new NotFoundError('Student not found');
    return { deleted: true };
  }

  static async promote(schoolId: string, fromClassId: string, toClassId: string) {
    if (!mongoose.isValidObjectId(fromClassId) || !mongoose.isValidObjectId(toClassId)) {
      throw new BadRequestError('Invalid class ids');
    }
    const [from, to] = await Promise.all([
      Class.findOne({ _id: fromClassId, schoolId }),
      Class.findOne({ _id: toClassId, schoolId }),
    ]);
    if (!from || !to) throw new BadRequestError('Class not found');
    const result = await Student.updateMany(
      { schoolId, classId: fromClassId },
      { $set: { classId: toClassId } }
    );
    return { promoted: result.modifiedCount || 0 };
  }
}
