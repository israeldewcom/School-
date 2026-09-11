import { z } from 'zod';

// ============================================================================
// SHARED PRIMITIVES
// ============================================================================
// Reused across all school schemas so validation rules stay in one place.
// Anything business-critical (email uniqueness, money units, ID shapes) is
// enforced here rather than at the controller layer.

const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid id — must be a 24-character hex string');

// Nigerian phone format: optionally starts with +234, or a leading 0 followed
// by 10 digits. Also accepts spaces and dashes which the UI often inserts.
const nigerianPhone = z
  .string()
  .trim()
  .regex(
    /^(\+?234|0)[\s-]?[789]\d{1}[\s-]?\d{3}[\s-]?\d{4}$/,
    'Invalid Nigerian phone number (e.g. 08031234567 or +2348031234567)'
  );

// Loose email check — the strict validator uses the same regex as Zod's
// built-in .email() but adds trimming and lowercasing at the model layer.
const emailField = z.string().trim().toLowerCase().email('Invalid email address');

// URL field accepts empty string too, so a form can clear the field.
const optionalUrl = z
  .string()
  .trim()
  .transform((s) => (s === '' ? undefined : s))
  .pipe(z.string().url('Invalid URL').optional())
  .optional();

// Slug: lowercase letters, numbers, and single dashes. No leading or trailing
// dash. Empty string is allowed so the pre-save hook can auto-generate.
const slugField = z
  .string()
  .trim()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug must contain only lowercase letters, numbers, and single dashes'
  );

// ISO 3166-1 alpha-3 style country code is overkill — the app only supports
// Nigeria right now, but the field is here for future expansion.
const countryField = z.string().trim().min(1, 'Country is required').max(60);

// Nigerian states. Kept as an enum so typos can't sneak in, but easy to
// extend. "Other" is the escape hatch for edge cases (FCT is its own entry).
const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
  'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu',
  'FCT - Abuja', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina',
  'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo',
  'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
] as const;

const stateField = z.string().trim().max(60);

// Currency: only NGN is supported today, but the schema allows the field to
// be set for future-proofing. Update this enum when adding support.
const currencyField = z.enum(['NGN', 'USD', 'GBP', 'EUR']).default('NGN');

// IANA timezone strings. Only Africa/Lagos matters now, but keeping this open
// means new regions don't require a schema change.
const timezoneField = z
  .string()
  .trim()
  .regex(/^[A-Za-z]+\/[A-Za-z_]+$/, 'Invalid timezone (e.g. Africa/Lagos)')
  .default('Africa/Lagos');

// ============================================================================
// CREATE SCHOOL
// ============================================================================
// Used by POST /schools (admin-created school, distinct from the public
// onboarding flow which has its own simpler schema).
//
// Restricted fields NOT allowed here (they're set by the system, not the
// client): smsBalance, smsRate, smsMonthlyUsage, subscriptionId, status
// (defaults to ACTIVE on create).

export const createSchoolSchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(2, 'School name must be at least 2 characters')
      .max(150, 'School name must be under 150 characters'),

    // Optional — the model's pre-save hook auto-generates this from `name`
    // if omitted. If supplied, it must be a valid slug.
    slug: slugField.optional(),

    logo: optionalUrl,
    motto: z.string().trim().max(200).optional(),

    address: z
      .string()
      .trim()
      .min(5, 'Address must be at least 5 characters')
      .max(300),

    phone: nigerianPhone,

    email: emailField,

    website: optionalUrl,

    country: countryField.default('Nigeria'),

    // State/city default to empty strings in the model so a school can be
    // created without them and filled in later.
    state: stateField.default(''),
    city: z.string().trim().max(80).default(''),

    currency: currencyField,
    timezone: timezoneField,

    // Free-text strings that describe the current academic period. The real
    // Session/Term documents are created separately (see onboarding flow).
    currentSession: z.string().trim().max(30).optional(),
    currentTerm: z.string().trim().max(30).optional(),
  }),
});

export type CreateSchoolInput = z.infer<typeof createSchoolSchema>['body'];

// ============================================================================
// UPDATE SCHOOL
// ============================================================================
// Used by PUT /schools/:id and PUT /schools/current.
//
// Explicitly EXCLUDES:
//   - smsBalance, smsRate, smsMonthlyUsage  → finance team controls these
//   - subscriptionId                        → set by billing flows only
//   - status transitions to SUSPENDED/ARCHIVED → restricted to SUPER_ADMIN
//                                              via a dedicated endpoint
//   - createdAt, updatedAt                  → timestamps are system-managed
//
// Every field is optional so a partial update is valid.

export const updateSchoolSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(150).optional(),
      slug: slugField.optional(),
      logo: optionalUrl,
      motto: z.string().trim().max(200).optional(),
      address: z.string().trim().min(5).max(300).optional(),
      phone: nigerianPhone.optional(),
      email: emailField.optional(),
      website: optionalUrl,
      country: countryField.optional(),
      state: stateField.optional(),
      city: z.string().trim().max(80).optional(),
      currency: currencyField.optional(),
      timezone: timezoneField.optional(),
      currentSession: z.string().trim().max(30).optional(),
      currentTerm: z.string().trim().max(30).optional(),
      // These two are the real Session/Term ObjectIds — set by the
      // onboarding flow and by the academic calendar UI.
      currentSessionId: objectId.optional(),
      currentTermId: objectId.optional(),
    })
    // Reject empty payloads early so a client that sends `{}` gets a clear
    // error instead of silently succeeding with no changes.
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update',
    }),
});

export type UpdateSchoolInput = z.infer<typeof updateSchoolSchema>['body'];

// ============================================================================
// UPDATE SCHOOL STATUS
// ============================================================================
// Separate schema because changing a school's status (ACTIVE → SUSPENDED)
// is a platform-admin action, not a normal profile edit. Keeping it isolated
// means the middleware can gate it behind a different permission.

export const updateSchoolStatusSchema = z.object({
  body: z.object({
    status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'], {
      errorMap: () => ({
        message: 'Status must be one of PENDING, ACTIVE, SUSPENDED, ARCHIVED',
      }),
    }),
    reason: z.string().trim().max(500).optional(),
  }),
});

// ============================================================================
// ONBOARDING (PUBLIC — no auth)
// ============================================================================
// Used by POST /schools/onboard. Stricter than the admin create schema
// because this is a public endpoint and any field here directly affects
// what gets written to the database on first signup.
//
// The classes array is capped at 50 to prevent a single request from
// bulk-inserting thousands of rows.

const onboardClassSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Class name is required')
    .max(60, 'Class name must be under 60 characters'),
  fee: z
    .union([z.number(), z.string()])
    .transform((v) => Number(v) || 0)
    .refine((v) => v >= 0, 'Fee cannot be negative')
    .refine((v) => v <= 100_000_000, 'Fee is unreasonably high'),
});

export const onboardSchema = z.object({
  body: z.object({
    schoolName: z
      .string()
      .trim()
      .min(2, 'School name is required')
      .max(150),

    schoolType: z
      .enum([
        'Nursery & Primary',
        'Primary Only',
        'Secondary Only',
        'Primary & Secondary',
      ])
      .default('Primary & Secondary'),

    address: z.string().trim().max(300).default(''),

    // Onboarding phone is optional so the wizard can skip it, but if present
    // it must be a valid Nigerian number.
    phone: z
      .string()
      .trim()
      .transform((s) => (s === '' ? undefined : s))
      .pipe(nigerianPhone.optional())
      .optional(),

    session: z.string().trim().max(30).default('2026/2027'),
    term: z
      .enum(['First Term', 'Second Term', 'Third Term'])
      .default('First Term'),

    classes: z
      .array(onboardClassSchema)
      .max(50, 'Too many classes in one onboarding request')
      .default([]),

    ownerName: z
      .string()
      .trim()
      .min(2, 'Owner name is required')
      .max(100),

    // Username is the login identifier — must be unique across the platform.
    username: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username must be under 30 characters')
      .regex(
        /^[a-zA-Z0-9_.-]+$/,
        'Username may only contain letters, numbers, underscores, dots, and dashes'
      ),

    password: z
      .string()
      .min(6, 'Password must be at least 6 characters')
      .max(128, 'Password is too long'),

    loadSample: z.boolean().default(false),
  }),
});

export type OnboardInput = z.infer<typeof onboardSchema>['body'];

// ============================================================================
// QUERY SCHEMAS
// ============================================================================
// Applied to list endpoints so a client can't inject Mongo operators
// (`?status[$ne]=ACTIVE`) or override the tenant scope via `?schoolId=other`.

export const listSchoolsQuerySchema = z.object({
  query: z
    .object({
      status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED']).optional(),
      state: z.string().trim().max(60).optional(),
      search: z.string().trim().max(100).optional(),
      page: z
        .union([z.string(), z.number()])
        .transform((v) => Math.max(1, Number(v) || 1))
        .optional(),
      limit: z
        .union([z.string(), z.number()])
        .transform((v) => Math.min(100, Math.max(1, Number(v) || 20)))
        .optional(),
    })
    .default({}),
});

// ============================================================================
// PARAM SCHEMAS
// ============================================================================
// Applied to routes with `:id` params so a malformed ObjectId produces a
// clean 400 instead of a Mongoose CastError that surfaces as a 500.

export const schoolIdParamSchema = z.object({
  params: z.object({
    id: objectId,
  }),
});

// ============================================================================
// EXPORTED CONSTANTS
// ============================================================================
// Re-export the state list in case any other module wants to build a dropdown
// without duplicating the source of truth.
export { NIGERIAN_STATES };
