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

// Release a class's cards to parents (optionally withholding students who owe fees)
router.post(
  '/publish-class',
  requirePermission('reportCards', 'write'),
  ReportCardController.publishClass
);

// One merged PDF for the whole class
router.get(
  '/render-class/:classId',
  requirePermission('reportCards', 'read'),
  ReportCardController.renderClassPdf
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
