// src/core/students/student.service.ts
import mongoose from 'mongoose';
import { Student } from '../../models/Student';
import { Class } from '../../models/Class';
import { Invoice } from '../../models/Invoice';
import { Payment } from '../../models/Payment';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';

export class StudentService {
  /**
   * Shape a raw student doc into the flat form the frontend expects.
   */
  private static shape(s: any, feeTotals?: { expected: number; paid: number }) {
    const primaryParent = Array.isArray(s.parentIds) ? s.parentIds[0] : null;
    const className = s.classId?.name || '—';

    const expected = feeTotals?.expected ?? s.fees?.expected ?? 0;
    const paid = feeTotals?.paid ?? s.fees?.paid ?? 0;
    const status =
      expected === 0 ? 'PAID'
      : paid >= expected ? 'PAID'
      : paid > 0 ? 'PARTIAL'
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
      className,
      classId: s.classId?._id ? String(s.classId._id) : (s.classId ? String(s.classId) : null),
      guardian: primaryParent
        ? `${primaryParent.firstName || ''} ${primaryParent.lastName || ''}`.trim()
        : (s.guardian || ''),
      guardianPhone: primaryParent?.phone || s.guardianPhone || '',
      guardianEmail: primaryParent?.email || s.guardianEmail || '',
      parentIds: (s.parentIds || []).map((p: any) => (p._id ? String(p._id) : String(p))),
      fees: { expected, paid, owed: Math.max(expected - paid, 0), status },
      createdAt: s.createdAt,
    };
  }

  private static async feeTotalsForStudents(schoolId: string, studentIds: string[]) {
    const expectedByStudent = new Map<string, number>();
    const paidByStudent = new Map<string, number>();

    try {
      const invoices = await Invoice.find({
        schoolId,
        studentId: { $in: studentIds.map((id) => new mongoose.Types.ObjectId(id)) },
      }).select('studentId total').lean();

      for (const inv of invoices) {
        const sid = String(inv.studentId);
        expectedByStudent.set(sid, (expectedByStudent.get(sid) || 0) + (inv.total || 0));
      }
    } catch (_) {}

    try {
      const payments = await Payment.find({
        schoolId,
        studentId: { $in: studentIds.map((id) => new mongoose.Types.ObjectId(id)) },
        status: { $in: ['CONFIRMED', 'APPROVED'] },
      }).select('studentId amount').lean();

      for (const p of payments) {
        const sid = String(p.studentId);
        paidByStudent.set(sid, (paidByStudent.get(sid) || 0) + (p.amount || 0));
      }
    } catch (_) {}

    const result = new Map<string, { expected: number; paid: number }>();
    const allIds = new Set([...expectedByStudent.keys(), ...paidByStudent.keys()]);
    for (const sid of allIds) {
      result.set(sid, {
        expected: expectedByStudent.get(sid) || 0,
        paid: paidByStudent.get(sid) || 0,
      });
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
    const feeMap = ids.length > 0
      ? await StudentService.feeTotalsForStudents(schoolId, ids)
      : new Map();

    return students.map((s: any) => StudentService.shape(s, feeMap.get(String(s._id))));
  }

  /**
   * Alias used by controllers that expect `getAll`.
   */
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
    if (dup) throw new BadRequestError('A student with that admission number already exists.');

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

    // Only set dateOfBirth when we actually have one — avoids the
    // "undefined not assignable to Date" issue.
    if (data.dateOfBirth) {
      payload.dateOfBirth = new Date(data.dateOfBirth);
    }

    const student = new Student(payload);
    await student.save();

    return StudentService.getById(schoolId, String(student._id));
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
      if (data.dateOfBirth) {
        student.dateOfBirth = new Date(data.dateOfBirth);
      } else {
        student.set('dateOfBirth', undefined);
      }
    }
    if (data.address !== undefined) student.address = data.address;
    if (data.parentIds !== undefined && Array.isArray(data.parentIds)) {
      student.parentIds = data.parentIds.filter((p: any) => mongoose.isValidObjectId(p));
    }

    await student.save();
    return StudentService.getById(schoolId, id);
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
