import { Request, Response, NextFunction } from 'express';
import { ExamService } from './exam.service';

export class ExamController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const exams = await ExamService.list(req.schoolId!, req.query);
      res.json({ success: true, data: exams });
    } catch (err) { next(err); }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const exam = await ExamService.create(req.schoolId!, req.body);
      res.status(201).json({ success: true, data: exam });
    } catch (err) { next(err); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const exam = await ExamService.update(req.schoolId!, req.params.id, req.body);
      res.json({ success: true, data: exam });
    } catch (err) { next(err); }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await ExamService.delete(req.schoolId!, req.params.id);
      res.json({ success: true, message: 'Exam deleted' });
    } catch (err) { next(err); }
  }
}
