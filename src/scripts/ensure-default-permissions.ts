// src/scripts/ensure-default-permissions.ts
//
// Auto-heals the "no Permission documents exist" problem on every server
// boot, the same way ensure-default-plans.ts does for SubscriptionPlan.
// Runs once, on startup, after MongoDB connects — if the Permission
// collection is empty, it creates the default role→permissions mapping
// using the same data as scripts/seed.ts.
//
// Also clears any cached permission lookups (perms:<ROLE> keys in the
// CacheEntry collection used by getJSON/setJSON — see config/mongoStore.ts)
// every time it runs. Why: permission.middleware.ts caches a role's
// permissions for 1 hour after the first lookup. If that first lookup ever
// happened while the Permission collection was still empty, it cached an
// empty array — meaning even after this script populates real permissions,
// every request for up to an hour would keep reading the stale empty
// cache and get "Permission denied" regardless of the database now being
// correct. Clearing the cache here guarantees the next request always sees
// current data, on every boot, not just the first one.
//
// SAFE to run every time the server starts:
//  - It only inserts Permission docs if the collection is completely empty
//    — it never overwrites permissions you've since edited for a role.
//  - Clearing the perms:* cache is always safe — it's just a cache; the
//    next request repopulates it from the database.
//  - It never touches users or admin accounts.

import { Permission } from '../models/Permission';
import { del } from '../config/mongoStore';
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
    if (existingCount === 0) {
      for (const rp of DEFAULT_ROLE_PERMISSIONS) {
        await Permission.findOneAndUpdate(
          { role: rp.role },
          { permissions: rp.permissions },
          { upsert: true }
        );
      }
      logger.info('No permission documents found — default role permissions created automatically.');
    }

    // Always clear the permission cache on boot, regardless of whether we
    // just inserted anything above — this guards against a stale
    // empty-array cache left over from a previous boot that ran before
    // permissions existed in the database.
    for (const rp of DEFAULT_ROLE_PERMISSIONS) {
      await del(`perms:${rp.role}`);
    }
  } catch (err) {
    logger.error('ensureDefaultPermissions failed:', err);
  }
};
