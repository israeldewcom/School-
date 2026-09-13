import { Request, Response, NextFunction } from 'express';
import { AttendanceService } from './attendance.service';

export class AttendanceController {
  static async mark(req: Request, res: Response, next: NextFunction) {
    try {
      const att = await AttendanceService.mark(req.schoolId!, req.body);
      res.status(201).json({ success: true, data: att });
    } catch (err) { next(err); }
  }

  static async getByStudent(req: Request, res: Response, next: NextFunction) {
    try {
      const att = await AttendanceService.getStudentAttendance(
        req.params.studentId,
        req.schoolId!,
        req.query.from ? new Date(req.query.from as string) : undefined,
        req.query.to ? new Date(req.query.to as string) : undefined
      );
      res.json({ success: true, data: att });
    } catch (err) { next(err); }
  }

  static async getByClass(req: Request, res: Response, next: NextFunction) {
    try {
      const { classId, date } = req.query;
      const att = await AttendanceService.getByClass(
        classId as string,
        req.schoolId!,
        new Date(date as string)
      );
      res.json({ success: true, data: att });
    } catch (err) { next(err); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const att = await AttendanceService.update(req.params.id, req.schoolId!, req.body);
      res.json({ success: true, data: att });
    } catch (err) { next(err); }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await AttendanceService.delete(req.params.id, req.schoolId!);
      res.json({ success: true, message: 'Attendance record deleted' });
    } catch (err) { next(err); }
  }

  static async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const summary = await AttendanceService.getAttendanceSummary(
        req.params.studentId,
        req.schoolId!
      );
      res.json({ success: true, data: summary });
    } catch (err) { next(err); }
  }

  static async getHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { from, to } = req.query;
      const records = await AttendanceService.getStudentAttendance(
        req.params.studentId,
        req.schoolId!,
        from ? new Date(from as string) : undefined,
        to ? new Date(to as string) : undefined
      );
      res.json({ success: true, data: records });
    } catch (err) { next(err); }
  }

  static async getToday(req: Request, res: Response, next: NextFunction) {
    try {
      const summary = await AttendanceService.getTodaySummary(req.schoolId!);
      res.json({ success: true, data: summary });
    } catch (err) { next(err); }
  }

  static async getWeekly(req: Request, res: Response, next: NextFunction) {
    try {
      const summary = await AttendanceService.getWeeklySummary(req.schoolId!);
      res.json({ success: true, data: summary });
    } catch (err) { next(err); }
  }
}
