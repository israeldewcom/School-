import express from 'express';
import { SupportController } from './support.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/audit-logs', requirePermission('support', 'read'), SupportController.getAuditLogs);

export default router;
