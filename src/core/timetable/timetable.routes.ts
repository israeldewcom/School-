// src/core/timetable/timetable.routes.ts
import express from 'express';
import { requirePermission } from '../../middleware/permission.middleware';
import { handle } from '../../utils/handler';
import { TimetableService } from './timetable.service';

const router = express.Router();

// Static paths before /:id
router.get('/mine', requirePermission('timetable', 'read'), handle((req) => TimetableService.mine(req.schoolId, req.userId, req.query)));

router.get(
  '/class/:classId',
  requirePermission('timetable', 'read'),
  handle((req, scope) => TimetableService.classWeek(req.schoolId, scope, req.params.classId, req.query))
);

// Replace a class's whole week (the edit-timetable screen).
router.put(
  '/class/:classId',
  requirePermission('timetable', 'write'),
  handle((req, scope) => TimetableService.replaceClassWeek(req.schoolId, scope, req.params.classId, req.body?.entries, req.body || {}))
);

router.get('/', requirePermission('timetable', 'read'), handle((req, scope) => TimetableService.list(req.schoolId, scope, req.query)));
router.post('/', requirePermission('timetable', 'write'), handle((req, scope) => TimetableService.create(req.schoolId, scope, req.body), 201));
router.put('/:id', requirePermission('timetable', 'write'), handle((req, scope) => TimetableService.update(req.schoolId, scope, req.params.id, req.body)));
router.delete('/:id', requirePermission('timetable', 'write'), handle((req, scope) => TimetableService.remove(req.schoolId, scope, req.params.id)));

export default router;
