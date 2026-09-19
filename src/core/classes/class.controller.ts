// src/core/classes/class.controller.ts
import { Request, Response, NextFunction } from 'express';
import { ClassService } from './class.service';

export class ClassController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const classes = await ClassService.list(req.schoolId);
      res.json({ success: true, data: classes });
    } catch (err) { next(err); }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const cls = await ClassService.getById(req.schoolId, req.params.id);
      res.json({ success: true, data: cls });
    } catch (err) { next(err); }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const cls = await ClassService.create(req.schoolId, req.body);
      res.status(201).json({ success: true, data: cls });
    } catch (err) { next(err); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const cls = await ClassService.update(req.schoolId, req.params.id, req.body);
      res.json({ success: true, data: cls });
    } catch (err) { next(err); }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ClassService.delete(req.schoolId, req.params.id);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }
}
