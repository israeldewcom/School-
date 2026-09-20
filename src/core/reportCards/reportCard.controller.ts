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

      if (!mongoose.isValidObjectId(studentId)) {
        throw new BadRequestError('Invalid student id');
      }

      // Find the template — explicit id, or the default one.
      let template;
      if (templateId && mongoose.isValidObjectId(templateId)) {
        template = await ReportCardTemplate.findOne({
          _id: templateId,
          schoolId: req.schoolId,
        });
      } else {
        template = await ReportCardTemplate.findOne({
          schoolId: req.schoolId,
          type: 'report_card',
          isActive: true,
        }).sort({ isDefault: -1, createdAt: -1 });
      }

      if (!template) {
        throw new BadRequestError(
          'No report card template uploaded. Upload one from Report Studio first.'
        );
      }

      // Gather the student + results.
      const student = await Student.findOne({ _id: studentId, schoolId: req.schoolId })
        .populate('classId', 'name')
        .lean();
      if (!student) throw new BadRequestError('Student not found');

      const results = await Result.find({
        schoolId: req.schoolId,
        studentId,
        sessionId,
        termId,
      })
        .populate('subjectId', 'name code')
        .lean();

      const subjectRows = results.map((r: any) => {
        const total = (r.caScore || 0) + (r.examScore || 0);
        return {
          subjectName: r.subjectId?.name || r.subjectName || 'Subject',
          ca: r.caScore || 0,
          exam: r.examScore || 0,
          total,
          grade: r.grade || gradeFor(total),
          remark: r.remark || '',
        };
      });

      const average =
        subjectRows.length > 0
          ? Math.round(
              subjectRows.reduce((s, r) => s + r.total, 0) / subjectRows.length
            )
          : 0;

      const pdf = await ReportCardRendererService.renderReportCard(
        req.schoolId,
        String((template as any)._id),
        {
          student: {
            fullName:
              (student as any).fullName ||
              `${(student as any).firstName || ''} ${(student as any).lastName || ''}`.trim(),
            admissionNumber: (student as any).admissionNumber || '',
            className: (student as any).classId?.name || '',
            dateOfBirth: (student as any).dateOfBirth
              ? new Date((student as any).dateOfBirth).toLocaleDateString('en-NG')
              : undefined,
            gender: (student as any).gender,
          },
          session: req.query.sessionName as string || '',
          term: req.query.termName as string || '',
          school: {
            name: (req as any).school?.name || 'School',
          },
          results: subjectRows,
          average,
          grade: gradeFor(average),
          teacherRemark: (student as any).reportRemark || '',
        }
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="report-card-${studentId}.pdf"`
      );
      res.send(pdf);
    } catch (err) { next(err); }
  }

  // ------------------------------------------------------------------
  // Receipt PDF rendering
  // ------------------------------------------------------------------
  static async renderReceipt(req: Request, res: Response, next: NextFunction) {
    try {
      const { paymentId } = req.params;
      const { templateId } = req.query as any;

      if (!mongoose.isValidObjectId(paymentId)) {
        throw new BadRequestError('Invalid payment id');
      }

      let template;
      if (templateId && mongoose.isValidObjectId(templateId)) {
        template = await ReportCardTemplate.findOne({
          _id: templateId,
          schoolId: req.schoolId,
        });
      } else {
        template = await ReportCardTemplate.findOne({
          schoolId: req.schoolId,
          type: 'receipt',
          isActive: true,
        }).sort({ isDefault: -1, createdAt: -1 });
      }

      if (!template) {
        throw new BadRequestError(
          'No receipt template uploaded. Upload one from Report Studio first.'
        );
      }

      const Payment = mongoose.model('Payment');
      const payment = await Payment.findOne({
        _id: paymentId,
        schoolId: req.schoolId,
      })
        .populate('studentId', 'fullName firstName lastName')
        .lean();

      if (!payment) throw new BadRequestError('Payment not found');

      const studentName =
        (payment as any).studentId?.fullName ||
        `${(payment as any).studentId?.firstName || ''} ${(payment as any).studentId?.lastName || ''}`.trim() ||
        '—';

      const pdf = await ReportCardRendererService.renderReceipt(
        req.schoolId,
        String((template as any)._id),
        {
          receiptNo: (payment as any).receiptNo || String(paymentId).slice(0, 8).toUpperCase(),
          date: new Date((payment as any).approvedAt || (payment as any).createdAt)
            .toLocaleDateString('en-NG'),
          studentName,
          amount: (payment as any).amount || 0,
          amountInWords: numberToWords((payment as any).amount || 0),
          method: (payment as any).method || '—',
          reference: (payment as any).reference || '—',
          schoolName: (req as any).school?.name || 'School',
        }
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="receipt-${paymentId}.pdf"`
      );
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

function numberToWords(kobo: number): string {
  const naira = Math.floor(kobo / 100);
  if (naira === 0) return 'Zero naira';
  const units = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  function threeDigits(n: number): string {
    let out = '';
    if (n >= 100) {
      out += units[Math.floor(n / 100)] + ' hundred';
      n %= 100;
      if (n > 0) out += ' and ';
    }
    if (n >= 20) {
      out += tens[Math.floor(n / 10)];
      if (n % 10 > 0) out += '-' + units[n % 10];
    } else if (n >= 10) {
      out += teens[n - 10];
    } else if (n > 0) {
      out += units[n];
    }
    return out;
  }

  const parts: string[] = [];
  const billion = Math.floor(naira / 1_000_000_000);
  const million = Math.floor((naira % 1_000_000_000) / 1_000_000);
  const thousand = Math.floor((naira % 1_000_000) / 1000);
  const rest = naira % 1000;

  if (billion > 0) parts.push(threeDigits(billion) + ' billion');
  if (million > 0) parts.push(threeDigits(million) + ' million');
  if (thousand > 0) parts.push(threeDigits(thousand) + ' thousand');
  if (rest > 0) parts.push(threeDigits(rest));

  const words = parts.join(' ').trim() || 'zero';
  return words.charAt(0).toUpperCase() + words.slice(1) + ' naira';
}
