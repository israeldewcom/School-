// src/core/site/site.html.routes.ts
//
// Mounted at /s in app.ts:
//   /s/<slug>               home
//   /s/<slug>/about         about us
//   /s/<slug>/programs      classes offered
//   /s/<slug>/gallery       photo gallery
//   /s/<slug>/admissions    online application + status check
//   /s/<slug>/contact       address, phone, email, map
//   /s/<slug>/sitemap.xml   sitemap for search engines
import express, { Request, Response } from 'express';
import { SiteService, publicBase } from './site.service';
import { renderSiteHtml, renderNotFoundHtml, SITE_PAGES, sitemapXml } from './site.renderer';
import logger from '../../config/logger';

const router = express.Router();

async function serve(req: Request, res: Response, page: string) {
  try {
    const payload = await SiteService.publicPayload(req.params.slug);
    if (payload.redirected) {
      res.redirect(302, `/s/${payload.slug}${page === 'home' ? '' : '/' + page}`);
      return;
    }
    if (req.path.endsWith('sitemap.xml')) {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(sitemapXml(payload, publicBase()));
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(renderSiteHtml(payload, page));
  } catch (err: any) {
    if (err?.statusCode === 404) {
      res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(renderNotFoundHtml(err.message));
      return;
    }
    logger.error(`site render failed: ${err?.message}`);
    res.status(500).send('Something went wrong. Please try again.');
  }
}

router.get('/:slug/sitemap.xml', (req, res) => serve(req, res, 'home'));

router.get('/:slug/:page', (req, res) => {
  const page = String(req.params.page || '').toLowerCase();
  if (!SITE_PAGES.includes(page)) {
    res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(renderNotFoundHtml('That page does not exist.'));
    return;
  }
  return serve(req, res, page);
});

router.get('/:slug', (req, res) => serve(req, res, 'home'));

export default router;
