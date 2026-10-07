// src/core/reportCards/reportCardTemplate.routes.ts
import express from 'express';
import { ReportCardTemplateController } from './reportCardTemplate.controller';
import { requirePermission } from '../../middleware/permission.middleware';
import { handle } from '../../utils/handler';
import { ReportCardPresetService } from './reportCardPresets.service';

const router = express.Router();

router.get('/', requirePermission('reportCards', 'read'), ReportCardTemplateController.list);

// Ready-made designs (declared before '/:id' so they are not mistaken for an id).
router.get('/presets', requirePermission('reportCards', 'read'), handle(() => ReportCardPresetService.list()));
router.get('/presets/gallery', requirePermission('reportCards', 'read'), handle((req) => ReportCardPresetService.gallery(req.schoolId, req.query)));
router.post('/presets/:presetId/apply', requirePermission('reportCards', 'write'), handle((req) => ReportCardPresetService.apply(req.schoolId, req.params.presetId, req.body || {}), 201));
router.post('/:id/refresh-design', requirePermission('reportCards', 'write'), handle((req) => ReportCardPresetService.refresh(req.schoolId, req.params.id)));
router.post('/', requirePermission('reportCards', 'write'), ReportCardTemplateController.create);
router.get('/:id', requirePermission('reportCards', 'read'), ReportCardTemplateController.getById);
router.put('/:id', requirePermission('reportCards', 'write'), ReportCardTemplateController.update);
router.delete('/:id', requirePermission('reportCards', 'write'), ReportCardTemplateController.delete);
router.post('/:id/set-default', requirePermission('reportCards', 'write'), ReportCardTemplateController.setDefault);

export default router;
