// src/core/site/site.public.routes.ts
//
// Public (no login) JSON API for a school's website and online admission form.
//   GET  /api/v1/public/sites/:slug          site content + admission form
//   POST /api/v1/public/sites/:slug/apply    submit an application
//   GET  /api/v1/public/sites/:slug/status   ?applicationNumber=&phone=
import express from 'express';
import rateLimit from 'express-rate-limit';
import { handlePlain } from '../../utils/handler';
import { SiteService } from './site.service';

const router = express.Router();

const applyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many applications from this connection. Please try again later.' },
});
const statusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many status checks. Please try again later.' },
});

router.get('/:slug', handlePlain((req) => SiteService.publicPayload(req.params.slug)));
router.post('/:slug/apply', applyLimiter, handlePlain((req) => SiteService.submitApplication(req.params.slug, req.body, req.ip), 201));
router.get(
  '/:slug/status',
  statusLimiter,
  handlePlain((req) => SiteService.applicationStatus(req.params.slug, String(req.query.applicationNumber || ''), String(req.query.phone || '')))
);

export default router;
