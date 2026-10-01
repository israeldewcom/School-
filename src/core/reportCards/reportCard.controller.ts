// src/core/reportCards/reportCard.controller.ts
import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { ReportCardService } from './reportCard.service';
import { ReportCardRendererService } from './reportCardRenderer.service';
import { ReportCardTemplate } from '../../models/ReportCardTemplate';
import { Student } from '../../models/Student';
import { Result } from '../../models/Result';
import { Class } from '../../models/Class';
import { BadRequestError } from '../../middleware/error.middleware';
import { ReceiptService } from '../payments/receipt.service';
import { ReportCardBatchService } from './reportCardBatch.service';
import { getUserScope, assertClassInScope, assertStudentInScope } from '../../middleware/scope.middleware';

export class ReportCardController {
  // ------------------------------------------------------------------
  // Existing JSON generation
  // ------------------------------------------------------------------
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
      const { classId, sessionId, termId, nextTermBegins } = req.body || {};
      assertClassInScope(await getUserScope(req), classId);
      const result = await ReportCardService.generateForClass(
        req.schoolId,
        classId,
        sessionId,
        termId,
        { nextTermBegins }
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

  // ------------------------------------------------------------------
  // PDF rendering on the uploaded template
  //
  // GET /report-cards/render/:studentId?sessionId=&termId=&templateId=
  //
  // Returns application/pdf. If templateId is omitted, uses the
  // school's default report card template.
  // ------------------------------------------------------------------
  static async renderPdf(req: Request, res: Response, next: NextFunction) {
    try {
      const { studentId } = req.params;
      const { sessionId, termId, templateId } = req.query as any;
      await assertStudentInScope(await getUserScope(req), req.schoolId, studentId);
      const pdf = await ReportCardBatchService.renderStudentPdf(req.schoolId, studentId, sessionId, termId, templateId);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="report-card-${studentId}.pdf"`);
      res.send(pdf);
    } catch (err) { next(err); }
  }

  // ------------------------------------------------------------------
  // One merged PDF for a whole class.
  // GET /report-cards/render-class/:classId?sessionId=&termId=&templateId=&nextTermBegins=
  // ------------------------------------------------------------------
  static async renderClassPdf(req: Request, res: Response, next: NextFunction) {
    try {
      const { classId } = req.params;
      const q = req.query as any;
      assertClassInScope(await getUserScope(req), classId);
      const { pdf, filename } = await ReportCardBatchService.renderClassPdf(req.schoolId, classId, q.sessionId, q.termId, {
        templateId: q.templateId,
        nextTermBegins: q.nextTermBegins,
        onlyPublished: q.onlyPublished === 'true',
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.send(pdf);
    } catch (err) { next(err); }
  }

  // POST /report-cards/publish-class { classId, sessionId, termId, withholdOwing? }
  static async publishClass(req: Request, res: Response, next: NextFunction) {
    try {
      const { classId, sessionId, termId, withholdOwing } = req.body || {};
      assertClassInScope(await getUserScope(req), classId);
      const data = await ReportCardBatchService.publishClass(req.schoolId, req.userId, classId, sessionId, termId, { withholdOwing: !!withholdOwing });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  // ------------------------------------------------------------------
  // Receipt PDF rendering
  // ------------------------------------------------------------------
  static async renderReceipt(req: Request, res: Response, next: NextFunction) {
    try {
      const { pdf, filename } = await ReceiptService.render(req.schoolId, req.params.paymentId, {
        templateId: (req.query as any).templateId,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.send(pdf);
    } catch (err) { next(err); }
  }
}

function gradeFor(total: number): string {
  if (total >= 75) return 'A';
  if (total >= 65) return 'B';
  if (total >= 55) return 'C';
  if (total >= 45) return 'D';
  if (total >= 40) return 'E';
  return 'F';
}
