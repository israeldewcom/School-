// src/core/students/student.controller.ts
import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { StudentService } from './student.service';
import { getUserScope } from '../../middleware/scope.middleware';
import { Class } from '../../models/Class';
import { BadRequestError } from '../../middleware/error.middleware';

export class StudentController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const scope = await getUserScope(req);
      const query: any = { ...(req.query || {}) };

      if (!scope.unrestricted) {
        if (scope.ownStudentIds) {
          const all = await StudentService.list(req.schoolId, query);
          const filtered = all.filter((s: any) => scope.ownStudentIds!.includes(s.id));
          res.json({ success: true, data: filtered });
          return;
        }
        if (scope.classIds) {
          if (scope.classIds.length === 1) {
            query.classId = scope.classIds[0];
          } else if (
            query.classId &&
            !scope.classIds.includes(String(query.classId))
          ) {
            res.json({ success: true, data: [] });
            return;
          }
        }
      }

      const students = await StudentService.list(req.schoolId, query);
      res.json({ success: true, data: students });
    } catch (err) { next(err); }
  }

  static async getStudents(req: Request, res: Response, next: NextFunction) {
    return StudentController.list(req, res, next);
  }

  static async getAll(req: Request, res: Response, next: NextFunction) {
    return StudentController.list(req, res, next);
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const student = await StudentService.getById(req.schoolId, req.params.id);
      res.json({ success: true, data: student });
    } catch (err) { next(err); }
  }

  static async getStudent(req: Request, res: Response, next: NextFunction) {
    return StudentController.getById(req, res, next);
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const student = await StudentService.create(req.schoolId, req.body);
      res.status(201).json({ success: true, data: student });
    } catch (err) { next(err); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const student = await StudentService.update(req.schoolId, req.params.id, req.body);
      res.json({ success: true, data: student });
    } catch (err) { next(err); }
  }

  static async linkParent(req: Request, res: Response, next: NextFunction) {
    try {
      const { parentId } = req.body || {};
      const student = await StudentService.linkParent(
        req.schoolId,
        req.params.id,
        parentId
      );
      res.json({ success: true, data: student });
    } catch (err) { next(err); }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await StudentService.delete(req.schoolId, req.params.id);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  static async bulkImport(req: Request, res: Response, next: NextFunction) {
    try {
      const rows = Array.isArray(req.body?.students) ? req.body.students : [];
      if (rows.length === 0) {
        throw new BadRequestError('No students provided');
      }

      const classes = await Class.find({ schoolId: req.schoolId })
        .select('_id name')
        .lean();
      const classByName = new Map<string, string>();
      for (const c of classes) {
        classByName.set(String(c.name).toLowerCase().trim(), String(c._id));
      }

      let added = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const r of rows) {
        const classId =
          (r.classId && mongoose.isValidObjectId(r.classId) && r.classId) ||
          classByName.get(String(r.className || '').toLowerCase().trim());

        if (!classId) {
          failed++;
          if (errors.length < 5) {
            errors.push(`Row "${r.fullName || '?'}": class "${r.className || '(empty)'}" not found`);
          }
          continue;
        }

        const fullName = String(r.fullName || '').trim();
        const parts = fullName.split(/\s+/);
        const firstName = r.firstName || parts[0] || '';
        const lastName = r.lastName || parts.slice(1).join(' ') || '';

        if (!firstName || !lastName) {
          failed++;
          if (errors.length < 5) {
            errors.push(`Row "${fullName || '?'}": missing first or last name`);
          }
          continue;
        }

        try {
          await StudentService.create(req.schoolId, {
            firstName,
            lastName,
            admissionNumber:
              r.admissionNumber ||
              `ADM-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
            classId,
            gender: r.gender === 'FEMALE' ? 'FEMALE' : 'MALE',
            address: r.address || undefined,
            parentIds: [],
          });
          added++;
        } catch (err: any) {
          failed++;
          if (errors.length < 5) {
            errors.push(`Row "${fullName}": ${err?.message || 'unknown error'}`);
          }
        }
      }

      res.json({
        success: true,
        data: { added, failed, total: rows.length, errors },
      });
    } catch (err) { next(err); }
  }

  static async promote(req: Request, res: Response, next: NextFunction) {
    try {
      const { fromClassId, toClassId } = req.body || {};
      if (!fromClassId || !toClassId) {
        throw new BadRequestError('fromClassId and toClassId are required');
      }
      const result = await StudentService.promote(req.schoolId, fromClassId, toClassId);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }
}
