import express from 'express';
import { AttendanceController } from './attendance.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

// IMPORTANT: static routes must be registered BEFORE any route that
// could shadow them. '/today' and '/weekly' would otherwise be caught
// by '/:id' patterns registered further down. This ordering is what
// made the page hang on "Loading..." in the screenshots.
router.get('/today', requirePermission('attendance', 'read'), AttendanceController.getToday);
router.get('/weekly', requirePermission('attendance', 'read'), AttendanceController.getWeekly);

router.post('/', requirePermission('attendance', 'write'), AttendanceController.mark);
router.get('/class', requirePermission('attendance', 'read'), AttendanceController.getByClass);
router.get('/summary/:studentId', requirePermission('attendance', 'read'), AttendanceController.getSummary);
router.get('/history/:studentId', requirePermission('attendance', 'read'), AttendanceController.getHistory);
router.get('/student/:studentId', requirePermission('attendance', 'read'), AttendanceController.getByStudent);

router.put('/:id', requirePermission('attendance', 'write'), AttendanceController.update);
router.delete('/:id', requirePermission('attendance', 'delete'), AttendanceController.delete);

export default router;
