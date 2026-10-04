// src/scripts/backfill-portal-accounts.ts
//
// Gives every EXISTING student and parent a portal login.
//   Student: username = admission number, password = admission number
//   Parent:  username = phone number,     password = phone number
// Accounts that already exist are left alone (passwords are never reset).
//
// Run with: npm run backfill:portal
import { School } from '../models/School';
import { PortalAccountService } from '../core/accounts/portalAccount.service';
import { connectDB } from '../config/database';
import logger from '../config/logger';

(async () => {
  await connectDB();
  const schools = await School.find({}).select('_id name').lean();
  let students = 0;
  let parents = 0;
  let skipped = 0;
  for (const s of schools as any[]) {
    const r = await PortalAccountService.backfillSchool(String(s._id));
    students += r.studentsCreated;
    parents += r.parentsCreated;
    skipped += r.skipped;
    logger.info(`${s.name}: ${r.studentsCreated} student login(s), ${r.parentsCreated} parent login(s), ${r.skipped} skipped`);
  }
  logger.info(`Done. ${students} student login(s) and ${parents} parent login(s) created, ${skipped} skipped.`);
  process.exit(0);
})().catch((err) => {
  logger.error(`backfill-portal-accounts failed: ${err?.message}`);
  process.exit(1);
});
