// src/core/students/student.controller.ts
import { Request, Response, NextFunction } from 'express';
import { StudentService } from './student.service';
import { getUserScope, studentFilterFromScope } from '../../middleware/scope.middleware';

export class StudentController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const scope = await getUserScope(req);
      const query: any = { ...(req.query || {}) };

      // Apply scope filters on top of any user-supplied filters.
      if (!scope.unrestricted && scope.classIds) {
        if (scope.classIds.length === 1) {
          query.classId = scope.classIds[0];
        } else if (query.classId && !scope.classIds.includes(String(query.classId))) {
          // Requesting a class outside scope — return empty.
          res.json({ success: true, data: [] });
          return;
        }
      }

      const students = await StudentService.list(req.schoolId!, query);
      res.json({ success: true, data: students });
    } catch (err) { next(err); }
  }

  static async getAll(req: Request, res: Response, next: NextFunction) {
    return StudentController.list(req, res, next);
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const student = await StudentService.getById(req.schoolId!, req.params.id);
      res.json({ success: true, data: student });
    } catch (err) { next(err); }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const student = await StudentService.create(req.schoolId!, req.body);
      res.status(201).json({ success: true, data: student });
    } catch (err) { next(err); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const student = await StudentService.update(req.schoolId!, req.params.id, req.body);
      res.json({ success: true, data: student });
    } catch (err) { next(err); }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await StudentService.delete(req.schoolId!, req.params.id);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  static async promote(req: Request, res: Response, next: NextFunction) {
    try {
      const { fromClassId, toClassId } = req.body || {};
      const result = await StudentService.promote(req.schoolId!, fromClassId, toClassId);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }
}
