// src/core/reportCards/reportCard.routes.ts
import express from 'express';
import { ReportCardController } from './reportCard.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

// Generate JSON (existing behaviour)
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

// Render PDF on the uploaded template
router.get(
  '/render/:studentId',
  requirePermission('reportCards', 'read'),
  ReportCardController.renderPdf
);

// Render receipt PDF
router.get(
  '/render-receipt/:paymentId',
  requirePermission('payments', 'read'),
  ReportCardController.renderReceipt
);

export default router;
