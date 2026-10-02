// src/scripts/backfill-sites.ts
//
// Gives every existing school its public website + admission form
// (new schools get one automatically at onboarding).
//
// Run with: npm run backfill:sites
import { School } from '../models/School';
import { SchoolSite } from '../models/SchoolSite';
import { SiteService, publicUrlFor } from '../core/site/site.service';
import { connectDB } from '../config/database';
import logger from '../config/logger';

(async () => {
  await connectDB();
  const schools = await School.find({}).select('_id name').lean();
  let created = 0;
  for (const s of schools as any[]) {
    const had = await SchoolSite.exists({ schoolId: s._id });
    const site = await SiteService.ensureSite(String(s._id));
    if (!had) {
      created += 1;
      logger.info(`Website created for ${s.name}: ${publicUrlFor(site.slug)}`);
    }
  }
  logger.info(`Done. ${created} website(s) created, ${schools.length - created} already existed.`);
  process.exit(0);
})().catch((err) => {
  logger.error(`backfill-sites failed: ${err?.message}`);
  process.exit(1);
});
