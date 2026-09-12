import express from 'express';
import { AttendanceController } from './attendance.controller';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validation.middleware';
import { markAttendanceSchema, updateAttendanceSchema } from './attendance.validator';

const router = express.Router();

// Static/aggregate routes MUST come before '/student/:studentId' style
// routes are fine since they use a distinct prefix, but keep 'today' and
// 'weekly' registered before any other route that could shadow them.
router.get('/today', requirePermission('attendance', 'read'), AttendanceController.getToday);
router.get('/weekly', requirePermission('attendance', 'read'), AttendanceController.getWeekly);

router.post('/', requirePermission('attendance', 'write'), validate(markAttendanceSchema), AttendanceController.mark);
router.get('/student/:studentId', requirePermission('attendance', 'read'), AttendanceController.getByStudent);
router.get('/class', requirePermission('attendance', 'read'), AttendanceController.getByClass);
router.put('/:id', requirePermission('attendance', 'write'), validate(updateAttendanceSchema), AttendanceController.update);
router.delete('/:id', requirePermission('attendance', 'delete'), AttendanceController.delete);

// NEW endpoints
router.get('/summary/:studentId', requirePermission('attendance', 'read'), AttendanceController.getSummary);
router.get('/history/:studentId', requirePermission('attendance', 'read'), AttendanceController.getHistory);

export default router;
