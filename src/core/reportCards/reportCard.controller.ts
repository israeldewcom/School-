import { Request, Response, NextFunction } from 'express';
import { ReportCardService } from './reportCard.service';
import { ReportCard } from '../../models/ReportCard';
import { NotFoundError } from '../../utils/errors';

export class ReportCardController {
  static async generate(req: Request, res: Response, next: NextFunction) {
    try {
      const { studentId, sessionId, termId, templateId } = req.body;
      const report = await ReportCardService.generateReportCard(studentId, sessionId, termId, templateId);
      res.status(201).json({ success: true, data: report });
    } catch (error) { next(error); }
  }

  static async generateForClass(req: Request, res: Response, next: NextFunction) {
    try {
      const { classId, sessionId, termId, templateId } = req.body;
      const reports = await ReportCardService.generateForClass(classId, sessionId, termId, templateId);
      res.status(201).json({ success: true, data: reports });
    } catch (error) { next(error); }
  }

  static async getReportCards(req: Request, res: Response, next: NextFunction) {
    try {
      const reports = await ReportCard.find({ schoolId: req.schoolId, ...req.query })
        .populate('studentId templateId');
      res.json({ success: true, data: reports });
    } catch (error) { next(error); }
  }

  static async getReportCard(req: Request, res: Response, next: NextFunction) {
    try {
      const report = await ReportCard.findOne({ _id: req.params.id, schoolId: req.schoolId })
        .populate('studentId templateId');
      if (!report) throw new NotFoundError('Report card not found');
      res.json({ success: true, data: report });
    } catch (error) { next(error); }
  }

  static async publish(req: Request, res: Response, next: NextFunction) {
    try {
      const report = await ReportCardService.publishReportCard(req.params.id, req.userId!);
      res.json({ success: true, data: report });
    } catch (error) { next(error); }
  }
}
