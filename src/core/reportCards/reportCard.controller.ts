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

  // One-click, whole-school generation. Returns immediately with a
  // batchId — the actual work happens in the background worker.
  static async generateForSchool(req: Request, res: Response, next: NextFunction) {
    try {
      const { sessionId, termId, templateId } = req.body;
      const batch = await ReportCardService.generateForSchool(
        req.schoolId!,
        sessionId,
        termId,
        req.userId!,
        templateId
      );
      res.status(202).json({ success: true, data: batch });
    } catch (error) { next(error); }
  }

  static async getBatch(req: Request, res: Response, next: NextFunction) {
    try {
      const batch = await ReportCardService.getBatch(req.params.batchId, req.schoolId!);
      res.json({ success: true, data: batch });
    } catch (error) { next(error); }
  }

  static async publishBatch(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ReportCardService.publishBatch(req.params.batchId, req.schoolId!, req.userId!);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  static async printBatch(req: Request, res: Response, next: NextFunction) {
    try {
      const pdfBuffer = await ReportCardService.printBatch(req.params.batchId, req.schoolId!);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="report-cards-batch-${req.params.batchId}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) { next(error); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const report = await ReportCardService.updateReportCard(req.params.id, req.schoolId!, req.body);
      res.json({ success: true, data: report });
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
