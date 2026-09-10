import express from 'express';
import { ReportCardController } from './reportCard.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/', requirePermission('reportCards', 'read'), ReportCardController.getReportCards);
router.get('/:id', requirePermission('reportCards', 'read'), ReportCardController.getReportCard);
router.put('/:id', requirePermission('reportCards', 'write'), ReportCardController.update);
router.post('/generate', requirePermission('reportCards', 'write'), ReportCardController.generate);
router.post('/generate-class', requirePermission('reportCards', 'write'), ReportCardController.generateForClass);
router.post('/generate-school', requirePermission('reportCards', 'write'), ReportCardController.generateForSchool);
router.get('/batches/:batchId', requirePermission('reportCards', 'read'), ReportCardController.getBatch);
router.post('/batches/:batchId/publish-all', requirePermission('reportCards', 'write'), ReportCardController.publishBatch);
router.get('/batches/:batchId/print-pdf', requirePermission('reportCards', 'read'), ReportCardController.printBatch);
router.post('/:id/publish', requirePermission('reportCards', 'write'), ReportCardController.publish);

export default router;
