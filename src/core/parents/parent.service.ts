// src/core/parents/parent.service.ts
import mongoose from 'mongoose';
import { Parent } from '../../models/Parent';
import { Student } from '../../models/Student';
import { Invoice } from '../../models/Invoice';
import { Payment } from '../../models/Payment';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';

export class ParentService {
  /**
   * Attach each parent's children plus their aggregated fee balances.
   */
  private static async attachChildren(schoolId: string, parents: any[]) {
    if (parents.length === 0) return [];

    const parentIds = parents.map(
      (p) => new mongoose.Types.ObjectId(String(p._id))
    );

    const students = await Student.find({
      schoolId,
      parentIds: { $in: parentIds },
      status: { $ne: 'DELETED' },
    })
      .populate('classId', 'name')
      .lean()
      .exec();

    const studentIds = (students as any[]).map((s) => s._id);
    const expectedByStudent = new Map<string, number>();
    const paidByStudent = new Map<string, number>();

    if (studentIds.length > 0) {
      try {
        const invoices = await Invoice.find({
          schoolId,
          studentId: { $in: studentIds },
          status: { $ne: 'CANCELLED' },
        })
          .select('studentId total')
          .lean()
          .exec();
        for (const inv of invoices as any[]) {
          const sid = String(inv.studentId);
          expectedByStudent.set(sid, (expectedByStudent.get(sid) || 0) + (inv.total || 0));
        }
      } catch (_) {}

      try {
        const payments = await Payment.find({
          schoolId,
          studentId: { $in: studentIds },
          status: { $in: ['APPROVED', 'CONFIRMED'] },
        })
          .select('studentId amount')
          .lean()
          .exec();
        for (const p of payments as any[]) {
          const sid = String(p.studentId);
          paidByStudent.set(sid, (paidByStudent.get(sid) || 0) + (p.amount || 0));
        }
      } catch (_) {}
    }

    const childrenByParent = new Map<string, any[]>();
    for (const s of students as any[]) {
      const childRecord = {
        id: String(s._id),
        fullName:
          s.fullName ||
          `${s.firstName || ''} ${s.lastName || ''}`.trim() ||
          'Unnamed',
        className: s.classId?.name || '—',
        classId: s.classId?._id ? String(s.classId._id) : null,
        admissionNumber: s.admissionNumber || '',
        fees: {
          expected: expectedByStudent.get(String(s._id)) || 0,
          paid: paidByStudent.get(String(s._id)) || 0,
        },
      };

      for (const pid of s.parentIds || []) {
        const key = String(pid);
        if (!childrenByParent.has(key)) childrenByParent.set(key, []);
        childrenByParent.get(key)!.push(childRecord);
      }
    }

    return parents.map((p) => {
      const children = childrenByParent.get(String(p._id)) || [];
      const outstanding = children.reduce(
        (sum, c) => sum + Math.max(c.fees.expected - c.fees.paid, 0),
        0
      );
      const fullName =
        p.fullName ||
        `${p.firstName || ''} ${p.lastName || ''}`.trim() ||
        'Unnamed parent';

      return {
        id: String(p._id),
        fullName,
        firstName: p.firstName || '',
        lastName: p.lastName || '',
        phone: p.phone || '',
        email: p.email || '',
        relationship: p.relationship || 'Guardian',
        children,
        childCount: children.length,
        outstanding,
      };
    });
  }

  static async list(schoolId: string, query: any = {}) {
    const filter: any = { schoolId };
    if (query.search) {
      const rx = new RegExp(String(query.search).trim(), 'i');
      filter.$or = [
        { firstName: rx },
        { lastName: rx },
        { phone: rx },
        { email: rx },
      ];
    }
    const parents = await Parent.find(filter)
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return ParentService.attachChildren(schoolId, parents as any[]);
  }

  static async getById(schoolId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestError('Invalid parent id');
    }
    const parent = await Parent.findOne({ _id: id, schoolId }).lean().exec();
    if (!parent) throw new NotFoundError('Parent not found');
    const enriched = await ParentService.attachChildren(schoolId, [parent as any]);
    return enriched[0];
  }

  static async create(schoolId: string, data: any) {
    if (!data?.firstName || !String(data.firstName).trim()) {
      throw new BadRequestError('First name is required');
    }
    if (!data?.lastName || !String(data.lastName).trim()) {
      throw new BadRequestError('Last name is required');
    }
    if (!data?.phone || !String(data.phone).trim()) {
      throw new BadRequestError('Phone number is required');
    }

    const firstName = String(data.firstName).trim();
    const lastName = String(data.lastName).trim();
    const fullName =
      data.fullName && String(data.fullName).trim()
        ? String(data.fullName).trim()
        : `${firstName} ${lastName}`;

    const payload: any = {
      schoolId,
      firstName,
      lastName,
      fullName,
      phone: String(data.phone).trim(),
      relationship: data.relationship ? String(data.relationship) : 'Guardian',
    };

    // Only set email when it's an actual non-empty string — assigning
    // `undefined` to the schema field triggers TS2322 for optional fields.
    if (data.email && String(data.email).trim()) {
      payload.email = String(data.email).trim().toLowerCase();
    }
    if (data.address && String(data.address).trim()) {
      payload.address = String(data.address).trim();
    }

    const parent = new Parent(payload);
    await parent.save();
    return ParentService.getById(schoolId, String(parent._id));
  }

  static async update(schoolId: string, id: string, data: any) {
    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestError('Invalid parent id');
    }
    const parent = await Parent.findOne({ _id: id, schoolId });
    if (!parent) throw new NotFoundError('Parent not found');

    if (data.firstName !== undefined) parent.firstName = String(data.firstName).trim();
    if (data.lastName !== undefined) parent.lastName = String(data.lastName).trim();
    if (parent.firstName || parent.lastName) {
      parent.fullName = `${parent.firstName || ''} ${parent.lastName || ''}`.trim();
    }
    if (data.phone !== undefined) parent.phone = String(data.phone).trim();
    if (data.email !== undefined) {
      if (data.email && String(data.email).trim()) {
        parent.email = String(data.email).trim().toLowerCase();
      } else {
        parent.set('email', undefined);
      }
    }
    if (data.relationship !== undefined) {
      parent.relationship = String(data.relationship || 'Guardian');
    }
    if (data.address !== undefined) {
      parent.address = data.address ? String(data.address).trim() : undefined;
    }

    await parent.save();
    return ParentService.getById(schoolId, id);
  }

  static async delete(schoolId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid parent id');
    const parent = await Parent.findOneAndDelete({ _id: id, schoolId });
    if (!parent) throw new NotFoundError('Parent not found');
    return { deleted: true };
  }
}
