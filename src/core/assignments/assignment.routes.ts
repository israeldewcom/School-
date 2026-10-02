// src/core/assignments/assignment.routes.ts
import express from 'express';
import { AssignmentController } from './assignment.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/', requirePermission('assignments', 'read'), AssignmentController.list);
router.post('/', requirePermission('assignments', 'write'), AssignmentController.create);

router.get('/:id', requirePermission('assignments', 'read'), AssignmentController.getById);
router.put('/:id', requirePermission('assignments', 'write'), AssignmentController.update);
router.delete('/:id', requirePermission('assignments', 'write'), AssignmentController.remove);

router.post('/:id/publish', requirePermission('assignments', 'write'), AssignmentController.publish);
router.post('/:id/close', requirePermission('assignments', 'write'), AssignmentController.close);

router.get('/:id/submissions', requirePermission('assignments', 'read'), AssignmentController.submissions);
router.put(
  '/:id/submissions/:submissionId/grade',
  requirePermission('assignments', 'write'),
  AssignmentController.grade
);

export default router;
