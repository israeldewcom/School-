// src/core/reportCards/reportCard.controller.ts
import { Request, Response, NextFunction } from 'express';
import { ReportCardService } from './reportCard.service';

export class ReportCardController {
  static async generateOne(req: Request, res: Response, next: NextFunction) {
    try {
      const { studentId, sessionId, termId } = req.body || {};
      const card = await ReportCardService.generateForStudent(
        req.schoolId,
        studentId,
        sessionId,
        termId
      );
      res.json({ success: true, data: card });
    } catch (err) { next(err); }
  }

  static async generateClass(req: Request, res: Response, next: NextFunction) {
    try {
      const { classId, sessionId, termId } = req.body || {};
      const result = await ReportCardService.generateForClass(
        req.schoolId,
        classId,
        sessionId,
        termId
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  static async generateSchool(req: Request, res: Response, next: NextFunction) {
    try {
      const { sessionId, termId } = req.body || {};
      const result = await ReportCardService.generateForSchool(
        req.schoolId,
        sessionId,
        termId
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }
}
