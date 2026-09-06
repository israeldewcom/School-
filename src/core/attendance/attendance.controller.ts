import { Request, Response, NextFunction } from 'express';
import { AttendanceService } from './attendance.service';

export class AttendanceController {
  static async mark(req: Request, res: Response, next: NextFunction) {
    try {
      const data = { ...req.body, schoolId: req.schoolId };
      const att = await AttendanceService.mark(data);
      res.status(201).json({ success: true, data: att });
    } catch (error) { next(error); }
  }

  static async getByStudent(req: Request, res: Response, next: NextFunction) {
    try {
      const att = await AttendanceService.getByStudent(req.params.studentId, req.schoolId!, req.query);
      res.json({ success: true, data: att });
    } catch (error) { next(error); }
  }

  static async getByClass(req: Request, res: Response, next: NextFunction) {
    try {
      const { classId, date } = req.query;
      const att = await AttendanceService.getByClass(classId as string, req.schoolId!, new Date(date as string));
      res.json({ success: true, data: att });
    } catch (error) { next(error); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const att = await AttendanceService.update(req.params.id, req.schoolId!, req.body);
      res.json({ success: true, data: att });
    } catch (error) { next(error); }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await AttendanceService.delete(req.params.id, req.schoolId!);
      res.json({ success: true, message: 'Attendance record deleted' });
    } catch (error) { next(error); }
  }
}
