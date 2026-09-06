import express from 'express';
import { ReportCardController } from './reportCard.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/', requirePermission('reportCards', 'read'), ReportCardController.getReportCards);
router.get('/:id', requirePermission('reportCards', 'read'), ReportCardController.getReportCard);
router.post('/generate', requirePermission('reportCards', 'write'), ReportCardController.generate);
router.post('/generate-class', requirePermission('reportCards', 'write'), ReportCardController.generateForClass);
router.post('/:id/publish', requirePermission('reportCards', 'write'), ReportCardController.publish);

export default router;
