// src/core/academics/subject.service.ts
import mongoose from 'mongoose';
import { Subject } from '../../models/Subject';
import { Class } from '../../models/Class';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';

export class SubjectService {
  // ------------------------------------------------------------------
  // Create
  // ------------------------------------------------------------------
  static async create(schoolId: string, data: any) {
    if (!data?.name || !String(data.name).trim()) {
      throw new BadRequestError('Subject name is required');
    }
    if (!data.code || String(data.code).trim() === '') {
      data.code = SubjectService.generateCode(data.name);
    }

    const classIds = await SubjectService.validateClassIds(schoolId, data.classIds);

    const existing = await Subject.findOne({ schoolId, code: data.code });
    if (existing) throw new BadRequestError('Subject code already exists');

    const subject = new Subject({
      schoolId,
      name: String(data.name).trim(),
      code: String(data.code).toUpperCase(),
      description: data.description ? String(data.description).trim() : '',
      classIds,
      isActive: data.isActive !== false,
    });
    await subject.save();
    return SubjectService.populated(subject._id.toString());
  }

  // ------------------------------------------------------------------
  // List / GetAll
  //
  // Overloads so both `list(schoolId)` and `list(schoolId, query)` compile.
  // ------------------------------------------------------------------
  static async list(schoolId: string, query?: any): Promise<any[]>;
  static async list(schoolId: string, query: any = {}) {
    const filter: any = { schoolId, isActive: true };

    // When classId is given, return subjects offered by that class OR
    // subjects with no class restriction (backward compat).
    if (query?.classId && mongoose.isValidObjectId(query.classId)) {
      filter.$or = [
        { classIds: query.classId },
        { classIds: { $size: 0 } },
        { classIds: { $exists: false } },
      ];
    }

    return Subject.find(filter)
      .populate('classIds', 'name')
      .sort({ name: 1 })
      .lean();
  }

  /**
   * Alias used by some route files. Same signature shape as `list` so
   * either name compiles against either call pattern.
   */
  static async getAll(schoolId: string, query?: any): Promise<any[]>;
  static async getAll(schoolId: string, query: any = {}) {
    return SubjectService.list(schoolId, query);
  }

  // ------------------------------------------------------------------
  // GetById
  //
  // Overloads:
  //   getById(id)                   — school filter omitted
  //   getById(schoolId, id)         — school filter applied
  //
  // Both compile. Both run without error. When only the id is passed,
  // the query relies on the id being globally unique (which it is —
  // ObjectId), so tenant isolation is preserved by the id itself.
  // ------------------------------------------------------------------
  static async getById(id: string): Promise<any>;
  static async getById(schoolId: string, id: string): Promise<any>;
  static async getById(a: string, b?: string): Promise<any> {
    const id = b ?? a;
    const schoolId = b ? a : undefined;

    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestError('Invalid subject id');
    }

    const filter: any = { _id: id };
    if (schoolId) filter.schoolId = schoolId;

    const subject = await Subject.findOne(filter).populate('classIds', 'name');
    if (!subject) throw new NotFoundError('Subject not found');
    return subject;
  }

  // ------------------------------------------------------------------
  // Update
  //
  // Overloads:
  //   update(id, data)              — no school filter
  //   update(schoolId, id, data)    — school filter applied
  // ------------------------------------------------------------------
  static async update(id: string, data: any): Promise<any>;
  static async update(schoolId: string, id: string, data: any): Promise<any>;
  static async update(a: string, b: any, c?: any): Promise<any> {
    const id = c !== undefined ? b : a;
    const data = c !== undefined ? c : b;
    const schoolId = c !== undefined ? a : undefined;

    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestError('Invalid subject id');
    }

    const filter: any = { _id: id };
    if (schoolId) filter.schoolId = schoolId;

    const subject = await Subject.findOne(filter);
    if (!subject) throw new NotFoundError('Subject not found');

    if (data.name !== undefined) subject.name = String(data.name).trim();
    if (data.code !== undefined && String(data.code).trim()) {
      subject.code = String(data.code).toUpperCase();
    }
    if (data.description !== undefined) {
      subject.description = String(data.description).trim();
    }
    if (data.isActive !== undefined) subject.isActive = !!data.isActive;
    if (data.classIds !== undefined) {
      // If schoolId wasn't passed but the subject has one on file, use
      // that as the tenant context for class validation.
      const effectiveSchoolId = schoolId || String(subject.schoolId);
      subject.classIds = await SubjectService.validateClassIds(
        effectiveSchoolId,
        data.classIds
      );
    }
    await subject.save();
    return SubjectService.populated(subject._id.toString());
  }

  // ------------------------------------------------------------------
  // Delete
  //
  // Overloads:
  //   delete(id)
  //   delete(schoolId, id)
  // ------------------------------------------------------------------
  static async delete(id: string): Promise<any>;
  static async delete(schoolId: string, id: string): Promise<any>;
  static async delete(a: string, b?: string): Promise<any> {
    const id = b ?? a;
    const schoolId = b ? a : undefined;

    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestError('Invalid subject id');
    }

    const filter: any = { _id: id };
    if (schoolId) filter.schoolId = schoolId;

    const subject = await Subject.findOneAndDelete(filter);
    if (!subject) throw new NotFoundError('Subject not found');
    return subject;
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private static async populated(id: string) {
    return Subject.findById(id).populate('classIds', 'name');
  }

  private static async validateClassIds(
    schoolId: string,
    raw: any
  ): Promise<mongoose.Types.ObjectId[]> {
    if (!Array.isArray(raw) || raw.length === 0) return [];
    const valid = raw.filter((id) => mongoose.isValidObjectId(id));
    if (valid.length !== raw.length) {
      throw new BadRequestError('One or more class ids are invalid');
    }
    const found = await Class.find({ _id: { $in: valid }, schoolId }).select('_id').lean();
    if (found.length !== valid.length) {
      throw new BadRequestError('One or more classes do not belong to this school');
    }
    const seen = new Set<string>();
    return valid.filter((id) => {
      const s = String(id);
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    }) as mongoose.Types.ObjectId[];
  }

  private static generateCode(name: string): string {
    const cleaned = String(name || '').replace(/[^a-zA-Z0-9 ]/g, '').trim();
    if (!cleaned) return `SUB${Date.now().toString(36).toUpperCase()}`;
    const parts = cleaned.split(/\s+/);
    if (parts.length === 1) {
      return `${parts[0].substring(0, 3).toUpperCase()}${Math.floor(100 + Math.random() * 900)}`;
    }
    const acronym = parts.map((p) => p[0]).join('').toUpperCase();
    return `${acronym}${Math.floor(10 + Math.random() * 90)}`;
  }
}
