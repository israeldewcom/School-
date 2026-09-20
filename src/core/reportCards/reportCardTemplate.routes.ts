// src/core/reportCards/reportCardTemplate.routes.ts
import express from 'express';
import { ReportCardTemplateController } from './reportCardTemplate.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/', requirePermission('reportCards', 'read'), ReportCardTemplateController.list);
router.post('/', requirePermission('reportCards', 'write'), ReportCardTemplateController.create);
router.get('/:id', requirePermission('reportCards', 'read'), ReportCardTemplateController.getById);
router.put('/:id', requirePermission('reportCards', 'write'), ReportCardTemplateController.update);
router.delete('/:id', requirePermission('reportCards', 'write'), ReportCardTemplateController.delete);
router.post('/:id/set-default', requirePermission('reportCards', 'write'), ReportCardTemplateController.setDefault);

export default router;
