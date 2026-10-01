// src/core/admissions/admission.routes.ts
import express from 'express';
import { requirePermission } from '../../middleware/permission.middleware';
import { handle } from '../../utils/handler';
import { AdmissionService, Actor } from './admission.service';

const router = express.Router();

const actor = (req: express.Request): Actor => ({
  id: req.userId,
  name: (req.user as any)?.name || `${(req.user as any)?.firstName || ''} ${(req.user as any)?.lastName || ''}`.trim() || 'Staff',
});

router.get('/stats', requirePermission('admissions', 'read'), handle((req) => AdmissionService.stats(req.schoolId)));
router.get('/', requirePermission('admissions', 'read'), handle((req) => AdmissionService.list(req.schoolId, req.query)));
router.post('/', requirePermission('admissions', 'write'), handle((req) => AdmissionService.createOffice(req.schoolId, actor(req), req.body), 201));
router.get('/:id', requirePermission('admissions', 'read'), handle((req) => AdmissionService.getById(req.schoolId, req.params.id)));
router.put('/:id', requirePermission('admissions', 'write'), handle((req) => AdmissionService.update(req.schoolId, req.params.id, req.body)));
router.post('/:id/notes', requirePermission('admissions', 'write'), handle((req) => AdmissionService.addNote(req.schoolId, actor(req), req.params.id, req.body?.text)));
router.post('/:id/status', requirePermission('admissions', 'write'), handle((req) => AdmissionService.setStatus(req.schoolId, actor(req), req.params.id, req.body)));
router.post('/:id/reject', requirePermission('admissions', 'write'), handle((req) => AdmissionService.reject(req.schoolId, actor(req), req.params.id, req.body?.reason)));

// Approve + enrol in one step (set { "enroll": false } to only offer a place).
router.post('/:id/approve', requirePermission('admissions', 'enroll'), handle((req) => AdmissionService.approve(req.schoolId, actor(req), req.params.id, req.body || {})));
router.post('/:id/enroll', requirePermission('admissions', 'enroll'), handle((req) => AdmissionService.enroll(req.schoolId, actor(req), req.params.id, req.body || {})));

export default router;
