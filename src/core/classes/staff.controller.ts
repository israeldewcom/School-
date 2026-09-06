import { Request, Response, NextFunction } from 'express';
import { ClassService } from './class.service';

export class ClassController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = { ...req.body, schoolId: req.schoolId };
      const cls = await ClassService.create(data);
      res.status(201).json({ success: true, data: cls });
    } catch (error) {
      next(error);
    }
  }

  static async getClasses(req: Request, res: Response, next: NextFunction) {
    try {
      const classes = await ClassService.getAll(req.schoolId!, req.query);
      res.json({ success: true, data: classes });
    } catch (error) {
      next(error);
    }
  }

  static async getClass(req: Request, res: Response, next: NextFunction) {
    try {
      const cls = await ClassService.getById(req.params.id, req.schoolId!);
      res.json({ success: true, data: cls });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const cls = await ClassService.update(req.params.id, req.schoolId!, req.body);
      res.json({ success: true, data: cls });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await ClassService.delete(req.params.id, req.schoolId!);
      res.json({ success: true, message: 'Class deleted' });
    } catch (error) {
      next(error);
    }
  }
}
