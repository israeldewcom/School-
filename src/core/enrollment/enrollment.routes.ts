// src/core/enrollment/enrollment.routes.ts
import express from 'express';
import { requirePermission } from '../../middleware/permission.middleware';
import { handle } from '../../utils/handler';
import { EnrollmentService } from './enrollment.service';

const router = express.Router();

// Per-class headcount, growth this month/term, 12-month curve, outstanding fees.
router.get('/overview', requirePermission('analytics', 'read'), handle((req, scope) => EnrollmentService.overview(req.schoolId, scope)));
router.get('/classes/:classId', requirePermission('analytics', 'read'), handle((req, scope) => EnrollmentService.classDetail(req.schoolId, scope, req.params.classId)));

export default router;
