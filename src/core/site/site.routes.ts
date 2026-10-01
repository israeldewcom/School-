// src/core/site/site.routes.ts
//
// Admin-side (authenticated) routes for editing the school's website + admission form.
import express from 'express';
import { requirePermission } from '../../middleware/permission.middleware';
import { handle } from '../../utils/handler';
import { SiteService } from './site.service';

const router = express.Router();

router.get('/', requirePermission('site', 'read'), handle((req) => SiteService.getAdmin(req.schoolId)));
router.put('/', requirePermission('site', 'write'), handle((req) => SiteService.update(req.schoolId, req.body)));
router.get('/slug-check', requirePermission('site', 'read'), handle((req) => SiteService.checkSlug(req.schoolId, String(req.query.slug || ''))));
router.put('/slug', requirePermission('site', 'write'), handle((req) => SiteService.changeSlug(req.schoolId, req.body?.slug)));
router.post('/publish', requirePermission('site', 'write'), handle((req) => SiteService.update(req.schoolId, { published: true })));
router.post('/unpublish', requirePermission('site', 'write'), handle((req) => SiteService.update(req.schoolId, { published: false })));
router.post('/reset', requirePermission('site', 'write'), handle((req) => SiteService.reset(req.schoolId)));
// Upload a hero / gallery / about image (base64 data URL) and get back a URL to place in a section.
router.post('/images', requirePermission('site', 'write'), handle((req) => SiteService.uploadImage(req.body?.dataUrl), 201));

export default router;
