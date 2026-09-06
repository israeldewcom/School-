import express from 'express';
import { ExportController } from './export.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/students', requirePermission('export', 'read'), ExportController.exportStudents);
router.get('/invoices', requirePermission('export', 'read'), ExportController.exportInvoices);
router.get('/payments', requirePermission('export', 'read'), ExportController.exportPayments);

export default router;
