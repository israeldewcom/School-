import express from 'express';
import { ReportCardTemplateController } from './reportCardTemplate.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/', requirePermission('reportCards', 'read'), ReportCardTemplateController.getAll);
router.get('/:id', requirePermission('reportCards', 'read'), ReportCardTemplateController.getOne);
router.post('/', requirePermission('reportCards', 'write'), ReportCardTemplateController.create);
router.put('/:id', requirePermission('reportCards', 'write'), ReportCardTemplateController.update);
router.post('/:id/set-default', requirePermission('reportCards', 'write'), ReportCardTemplateController.setDefault);
router.delete('/:id', requirePermission('reportCards', 'write'), ReportCardTemplateController.remove);

export default router;
