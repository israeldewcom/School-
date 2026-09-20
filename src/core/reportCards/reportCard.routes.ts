// src/core/reportCards/reportCard.routes.ts
import express from 'express';
import { ReportCardController } from './reportCard.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.post(
  '/generate',
  requirePermission('reportCards', 'write'),
  ReportCardController.generateOne
);
router.post(
  '/generate-class',
  requirePermission('reportCards', 'write'),
  ReportCardController.generateClass
);
router.post(
  '/generate-school',
  requirePermission('reportCards', 'write'),
  ReportCardController.generateSchool
);

export default router;
