// src/core/branding/branding.routes.ts
import express from 'express';
import { requirePermission } from '../../middleware/permission.middleware';
import { handle } from '../../utils/handler';
import { LogoService } from './logo.service';

const router = express.Router();

router.get('/', requirePermission('site', 'read'), handle((req) => LogoService.current(req.schoolId)));

// Returns six ready-made logo designs as SVG, built from the school name and colours.
router.post('/logo/options', requirePermission('site', 'write'), handle((req) => LogoService.options(req.schoolId, req.body)));

// Saves the chosen design as the school logo.
router.post('/logo/apply', requirePermission('site', 'write'), handle((req) => LogoService.apply(req.schoolId, req.body), 201));

// Upload the school's own logo (base64 data URL).
router.post('/logo/upload', requirePermission('site', 'write'), handle((req) => LogoService.upload(req.schoolId, req.body?.dataUrl), 201));

export default router;
