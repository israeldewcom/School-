// src/core/portal/portal.controller.ts
import { Request, Response, NextFunction } from 'express';
import { PortalService } from './portal.service';
import { getUserScope, UserScope } from '../../middleware/scope.middleware';

type Handler = (req: Request, scope: UserScope) => Promise<any>;

function wrap(fn: Handler) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scope = await getUserScope(req);
      const data = await fn(req, scope);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };
}

export class PortalController {
  static me = wrap((req, scope) => PortalService.me(scope, (req as any).user));

  static children = wrap((_req, scope) => PortalService.listChildren(scope));

  static child = wrap((req, scope) => PortalService.getChild(scope, req.params.studentId));

  static overview = wrap((req, scope) => PortalService.overview(scope, req.params.studentId));

  static results = wrap((req, scope) =>
    PortalService.results(scope, req.params.studentId, req.query)
  );

  static reportCards = wrap((req, scope) =>
    PortalService.reportCards(scope, req.params.studentId)
  );

  static reportCard = wrap((req, scope) =>
    PortalService.reportCard(scope, req.params.studentId, req.params.id)
  );

  static attendance = wrap((req, scope) =>
    PortalService.attendance(scope, req.params.studentId, req.query)
  );

  static financeSummary = wrap((req, scope) =>
    PortalService.financeSummary(scope, req.params.studentId)
  );

  static invoices = wrap((req, scope) => PortalService.invoices(scope, req.params.studentId));

  static payments = wrap((req, scope) => PortalService.payments(scope, req.params.studentId));

  static timetable = wrap((req, scope) => PortalService.timetable(scope, req.params.studentId));

  static assignments = wrap((req, scope) => PortalService.assignments(scope, req.params.studentId));

  static submitAssignment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scope = await getUserScope(req);
      const data = await PortalService.submitAssignment(scope, req.params.studentId, req.params.assignmentId, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  };

  static receiptPdf = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scope = await getUserScope(req);
      const { pdf, filename } = await PortalService.receiptPdf(scope, req.params.studentId, req.params.paymentId);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.send(pdf);
    } catch (err) { next(err); }
  };

  static reportCardPdf = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scope = await getUserScope(req);
      const pdf = await PortalService.reportCardPdf(scope, req.params.studentId, req.params.id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="report-card.pdf"');
      res.send(pdf);
    } catch (err) { next(err); }
  };
}
