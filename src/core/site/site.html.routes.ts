// src/core/site/site.html.routes.ts
//
// Mounted at /s in app.ts:  https://your-api/s/st-marys-college
// Typos, spaces, missing dashes and old links redirect to the school's real link.
import express, { Request, Response } from 'express';
import { SiteService } from './site.service';
import { renderSiteHtml, renderNotFoundHtml } from './site.renderer';
import logger from '../../config/logger';

const router = express.Router();

router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const payload = await SiteService.publicPayload(req.params.slug);
    if (payload.redirected) {
      res.redirect(302, `/s/${payload.slug}`);
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(renderSiteHtml(payload));
  } catch (err: any) {
    if (err?.statusCode === 404) {
      res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(renderNotFoundHtml(err.message));
      return;
    }
    logger.error(`site render failed: ${err?.message}`);
    res.status(500).send('Something went wrong. Please try again.');
  }
});

export default router;
