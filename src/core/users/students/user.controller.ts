import { Request, Response, NextFunction } from 'express';
import { StudentService } from './student.service';

export class StudentController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = { ...req.body, schoolId: req.schoolId };
      const student = await StudentService.create(data);
      res.status(201).json({ success: true, data: student });
    } catch (error) {
      next(error);
    }
  }

  static async getStudents(req: Request, res: Response, next: NextFunction) {
    try {
      const students = await StudentService.getAll(req.schoolId!, req.query);
      res.json({ success: true, data: students });
    } catch (error) {
      next(error);
    }
  }

  static async getStudent(req: Request, res: Response, next: NextFunction) {
    try {
      const student = await StudentService.getById(req.params.id, req.schoolId!);
      res.json({ success: true, data: student });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const student = await StudentService.update(req.params.id, req.schoolId!, req.body);
      res.json({ success: true, data: student });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await StudentService.delete(req.params.id, req.schoolId!);
      res.json({ success: true, message: 'Student deleted' });
    } catch (error) {
      next(error);
    }
  }
}
