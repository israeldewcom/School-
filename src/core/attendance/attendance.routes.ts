import express from 'express';
import { AttendanceController } from './attendance.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.post('/', requirePermission('attendance', 'write'), AttendanceController.mark);
router.get('/student/:studentId', requirePermission('attendance', 'read'), AttendanceController.getByStudent);
router.get('/class', requirePermission('attendance', 'read'), AttendanceController.getByClass);
router.put('/:id', requirePermission('attendance', 'write'), AttendanceController.update);
router.delete('/:id', requirePermission('attendance', 'delete'), AttendanceController.delete);

// NEW endpoints
router.get('/summary/:studentId', requirePermission('attendance', 'read'), AttendanceController.getSummary);
router.get('/history/:studentId', requirePermission('attendance', 'read'), AttendanceController.getHistory);

export default router;
