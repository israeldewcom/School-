// src/core/attendance/attendance.routes.ts
import express from 'express';
import mongoose from 'mongoose';
import { AttendanceController } from './attendance.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

// ==================================================================
// Static routes — MUST come before /:id patterns.
// ==================================================================

router.get(
  '/today',
  requirePermission('attendance', 'read'),
  AttendanceController.getToday
);

router.get(
  '/weekly',
  requirePermission('attendance', 'read'),
  AttendanceController.getWeekly
);

/**
 * Range/history query used by the Attendance Review page.
 * Returns a flat list of attendance records joined with student
 * name and class name.
 */
router.get(
  '/review',
  requirePermission('attendance', 'read'),
  async (req, res, next) => {
    try {
      const Attendance = mongoose.model('Attendance');
      const { from, to, studentId, classId } = req.query;
      const filter: any = { schoolId: req.schoolId };

      if (from || to) {
        filter.date = {};
        if (from) filter.date.$gte = new Date(from as string);
        if (to) filter.date.$lte = new Date(to as string);
      }
      if (studentId && mongoose.isValidObjectId(studentId)) {
        filter.studentId = studentId;
      }
      if (classId && mongoose.isValidObjectId(classId)) {
        filter.classId = classId;
      }

      const records = await Attendance.find(filter)
        .populate('studentId', 'fullName firstName lastName admissionNumber')
        .populate('classId', 'name')
        .sort({ date: -1 })
        .limit(1000)
        .lean();

      res.json({
        success: true,
        data: records.map((r: any) => ({
          id: String(r._id),
          studentId: r.studentId?._id ? String(r.studentId._id) : String(r.studentId),
          studentName:
            r.studentId?.fullName ||
            `${r.studentId?.firstName || ''} ${r.studentId?.lastName || ''}`.trim() ||
            '—',
          classId: r.classId?._id ? String(r.classId._id) : String(r.classId),
          className: r.classId?.name || '—',
          date: r.date,
          timestamp: r.timestamp,
          status: r.status,
          remark: r.remark,
        })),
      });
    } catch (err) { next(err); }
  }
);

// ==================================================================
// Write operations
// ==================================================================
router.post(
  '/',
  requirePermission('attendance', 'write'),
  AttendanceController.mark
);

// ==================================================================
// Per-student reads
// ==================================================================
router.get(
  '/class',
  requirePermission('attendance', 'read'),
  AttendanceController.getByClass
);

router.get(
  '/summary/:studentId',
  requirePermission('attendance', 'read'),
  AttendanceController.getSummary
);

router.get(
  '/history/:studentId',
  requirePermission('attendance', 'read'),
  AttendanceController.getHistory
);

router.get(
  '/student/:studentId',
  requirePermission('attendance', 'read'),
  AttendanceController.getByStudent
);

// ==================================================================
// Record-level updates — must be last so /:id doesn't catch
// /today, /weekly, /review, /class, etc.
// ==================================================================
router.put(
  '/:id',
  requirePermission('attendance', 'write'),
  AttendanceController.update
);

router.delete(
  '/:id',
  requirePermission('attendance', 'delete'),
  AttendanceController.delete
);

export default router;
