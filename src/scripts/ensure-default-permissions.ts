// src/scripts/ensure-default-permissions.ts
//
// Auto-heals the "no Permission documents exist" problem on every server
// boot, the same way ensure-default-plans.ts does for SubscriptionPlan.
// Runs once, on startup, after MongoDB connects — if the Permission
// collection is empty, it creates the default role→permissions mapping
// using the same data as scripts/seed.ts.
//
// Why this exists: seed.ts seeds Permission and SubscriptionPlan together,
// but on environments where nobody ran `npm run seed` (e.g. Render's free
// tier, with no Shell to run it), BOTH collections end up empty — not just
// plans. That's exactly what caused "Permission denied: subscriptions:read"
// for a SCHOOL_OWNER who should have had blanket (*:*) access. This makes
// that impossible going forward: the moment the Permission collection is
// empty, the next server boot repopulates the default roles automatically.
//
// SAFE to run every time the server starts:
//  - It only inserts if the collection is completely empty — it never
//    overwrites permissions you've since edited for a role in the database.
//  - It never touches users or admin accounts — only role permissions.

import { Permission } from '../models/Permission';
import logger from '../config/logger';

const DEFAULT_ROLE_PERMISSIONS = [
  { role: 'SUPER_ADMIN', permissions: ['*:*'] },
  { role: 'SCHOOL_OWNER', permissions: ['*:*'] },
  {
    role: 'ACCOUNTANT',
    permissions: [
      'fees:read', 'fees:write',
      'invoices:read', 'invoices:write',
      'payments:read', 'payments:write', 'payments:approve',
      'reports:finance',
    ],
  },
  {
    role: 'TEACHER',
    permissions: ['students:read', 'results:write', 'attendance:write', 'classes:read'],
  },
  { role: 'STAFF', permissions: ['students:read', 'classes:read'] },
  {
    role: 'PARENT',
    permissions: ['students:read', 'payments:read', 'results:read', 'attendance:read'],
  },
];

export const ensureDefaultPermissions = async (): Promise<void> => {
  try {
    const existingCount = await Permission.countDocuments({});
    if (existingCount > 0) {
      // Some role permissions already exist — don't touch anything, so any
      // manual edits made directly in the database survive restarts.
      return;
    }

    for (const rp of DEFAULT_ROLE_PERMISSIONS) {
      await Permission.findOneAndUpdate(
        { role: rp.role },
        { permissions: rp.permissions },
        { upsert: true }
      );
    }
    logger.info('No permission documents found — default role permissions created automatically.');
  } catch (err) {
    logger.error('ensureDefaultPermissions failed:', err);
  }
};
