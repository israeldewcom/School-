// src/core/classes/class.service.ts
import mongoose from 'mongoose';
import { Class } from '../../models/Class';
import { Student } from '../../models/Student';
import { Staff } from '../../models/Staff';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';
import logger from '../../config/logger';

export class ClassService {
  static async list(schoolId: string) {
    const classes = await Class.find({ schoolId })
      .sort({ level: 1, name: 1 })
      .lean();

    // Attach live student counts.
    const counts = await Student.aggregate([
      { $match: { schoolId: new mongoose.Types.ObjectId(schoolId), status: 'ACTIVE' } },
      { $group: { _id: '$classId', count: { $sum: 1 } } },
    ]);
    const countByClass = new Map<string, number>();
    for (const c of counts) {
      if (c._id) countByClass.set(String(c._id), c.count);
    }

    return classes.map((c: any) => ({
      id: String(c._id),
      name: c.name,
      fee: c.fee || 0,
      level: c.level || null,
      academicYear: c.academicYear || '',
      homeroomTeacher: c.homeroomTeacher || null,
      studentCount: countByClass.get(String(c._id)) || 0,
    }));
  }

  static async getById(schoolId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid class id');
    const cls = await Class.findOne({ _id: id, schoolId }).lean();
    if (!cls) throw new NotFoundError('Class not found');
    return { ...cls, id: String((cls as any)._id) };
  }

  static async create(schoolId: string, data: any) {
    if (!data?.name || !String(data.name).trim()) {
      throw new BadRequestError('Class name is required');
    }
    if (!data?.level || Number(data.level) < 1) {
      throw new BadRequestError('Class level must be a positive number');
    }
    if (!data?.academicYear || !String(data.academicYear).trim()) {
      throw new BadRequestError('Academic year is required');
    }

    const dup = await Class.findOne({ schoolId, name: String(data.name).trim() });
    if (dup) throw new BadRequestError('A class with that name already exists.');

    const payload: any = {
      schoolId,
      name: String(data.name).trim(),
      fee: Number(data.fee) || 0,
      level: Number(data.level),
      academicYear: String(data.academicYear).trim(),
    };

    // Only attach homeroomTeacher when it's a valid ObjectId referencing
    // a staff member in this school. The frontend sometimes sends a
    // name string; we drop those.
    if (data.homeroomTeacher && mongoose.isValidObjectId(data.homeroomTeacher)) {
      const staff = await Staff.findOne({ _id: data.homeroomTeacher, schoolId });
      if (staff) payload.homeroomTeacher = data.homeroomTeacher;
    }

    const cls = new Class(payload);
    await cls.save();
    return ClassService.getById(schoolId, String(cls._id));
  }

  /**
   * Update a class. Every field is optional — only the ones actually
   * present in the payload are applied. homeroomTeacher is silently
   * dropped if it isn't a valid ObjectId so that the common case
   * (sending a name string) doesn't blow up the save.
   */
  static async update(schoolId: string, id: string, data: any) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid class id');
    const cls = await Class.findOne({ _id: id, schoolId });
    if (!cls) throw new NotFoundError('Class not found');

    if (data.name !== undefined) {
      const trimmed = String(data.name).trim();
      if (!trimmed) throw new BadRequestError('Class name cannot be empty');
      const dup = await Class.findOne({ schoolId, name: trimmed, _id: { $ne: id } });
      if (dup) throw new BadRequestError('Another class already has that name.');
      cls.name = trimmed;
    }

    if (data.level !== undefined) {
      const lvl = Number(data.level);
      if (!Number.isFinite(lvl) || lvl < 1) {
        throw new BadRequestError('Class level must be a positive number');
      }
      cls.level = lvl;
    }

    if (data.fee !== undefined) {
      const fee = Number(data.fee);
      if (!Number.isFinite(fee) || fee < 0) {
        throw new BadRequestError('Fee must be a non-negative number');
      }
      cls.fee = fee;
    }

    if (data.academicYear !== undefined) {
      const year = String(data.academicYear).trim();
      if (year) cls.academicYear = year;
    }

    // homeroomTeacher: only set when it's a real ObjectId.
    if (data.homeroomTeacher !== undefined) {
      if (!data.homeroomTeacher || data.homeroomTeacher === '') {
        cls.set('homeroomTeacher', undefined);
      } else if (mongoose.isValidObjectId(data.homeroomTeacher)) {
        const staff = await Staff.findOne({ _id: data.homeroomTeacher, schoolId });
        if (staff) cls.homeroomTeacher = data.homeroomTeacher;
        // If the id doesn't resolve to a staff member, we silently
        // ignore it rather than rejecting the save. The frontend is
        // probably sending a name string by mistake.
      }
      // Anything else (a name, a random string) is dropped silently.
    }

    await cls.save();
    logger.info(`Class ${id} updated`);
    return ClassService.getById(schoolId, id);
  }

  static async delete(schoolId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid class id');
    const inUse = await Student.countDocuments({ schoolId, classId: id, status: 'ACTIVE' });
    if (inUse > 0) {
      throw new BadRequestError(
        `Cannot delete this class — ${inUse} student${inUse === 1 ? '' : 's'} are still assigned to it. Move them first.`
      );
    }
    const cls = await Class.findOneAndDelete({ _id: id, schoolId });
    if (!cls) throw new NotFoundError('Class not found');
    return { deleted: true };
  }
}
