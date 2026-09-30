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
}
