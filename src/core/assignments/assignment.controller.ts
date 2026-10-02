// src/core/assignments/assignment.controller.ts
import { Request, Response, NextFunction } from 'express';
import { AssignmentService } from './assignment.service';
import { getUserScope, UserScope } from '../../middleware/scope.middleware';

type Handler = (req: Request, scope: UserScope) => Promise<any>;

function wrap(fn: Handler, status = 200) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scope = await getUserScope(req);
      const data = await fn(req, scope);
      res.status(status).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };
}

export class AssignmentController {
  static list = wrap((req, scope) =>
    AssignmentService.list(req.schoolId!, scope, req.query)
  );

  static getById = wrap((req, scope) =>
    AssignmentService.getById(req.schoolId!, scope, req.params.id)
  );

  static create = wrap(
    (req, scope) => AssignmentService.create(req.schoolId!, scope, (req as any).user, req.body),
    201
  );

  static update = wrap((req, scope) =>
    AssignmentService.update(req.schoolId!, scope, req.params.id, req.body)
  );

  static publish = wrap((req, scope) =>
    AssignmentService.publish(req.schoolId!, scope, req.params.id)
  );

  static close = wrap((req, scope) =>
    AssignmentService.close(req.schoolId!, scope, req.params.id)
  );

  static remove = wrap((req, scope) =>
    AssignmentService.remove(req.schoolId!, scope, req.params.id)
  );

  static submissions = wrap((req, scope) =>
    AssignmentService.submissions(req.schoolId!, scope, req.params.id)
  );

  static grade = wrap((req, scope) =>
    AssignmentService.grade(req.schoolId!, scope, req.params.id, req.params.submissionId, req.body)
  );
}
