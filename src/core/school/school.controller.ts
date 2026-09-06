import { Request, Response, NextFunction } from 'express';
import { SchoolService } from './school.service';

export class SchoolController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const school = await SchoolService.create(req.body);
      res.status(201).json({ success: true, data: school });
    } catch (error) {
      next(error);
    }
  }

  static async getSchools(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user.role !== 'SUPER_ADMIN') {
        const school = await SchoolService.getById(req.schoolId!);
        return res.json({ success: true, data: school });
      }
      const schools = await SchoolService.getAll(req.query);
      res.json({ success: true, data: schools });
    } catch (error) {
      next(error);
    }
  }

  static async getSchool(req: Request, res: Response, next: NextFunction) {
    try {
      const school = await SchoolService.getById(req.params.id);
      res.json({ success: true, data: school });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const school = await SchoolService.update(req.params.id, req.body);
      res.json({ success: true, data: school });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await SchoolService.delete(req.params.id);
      res.json({ success: true, message: 'School deleted' });
    } catch (error) {
      next(error);
    }
  }
}
