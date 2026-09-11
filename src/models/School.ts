import mongoose, { Schema, Document, Model } from 'mongoose';

// ============================================================================
// TYPES
// ============================================================================

export type SchoolStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

export type SchoolType =
  | 'Nursery & Primary'
  | 'Primary Only'
  | 'Secondary Only'
  | 'Primary & Secondary';

export type SchoolCurrency = 'NGN' | 'USD' | 'GBP' | 'EUR';

export interface ISchool extends Document {
  // Identity
  name: string;
  slug: string;
  logo?: string;
  motto?: string;

  // Contact
  address: string;
  phone: string;
  email: string;
  website?: string;

  // Location
  country: string;
  state: string;
  city: string;
  timezone: string;
  currency: SchoolCurrency;

  // Classification
  schoolType: SchoolType;
  status: SchoolStatus;

  // Current academic period
  //
  // The `currentSession` / `currentTerm` string fields are legacy and kept
  // for backwards compatibility. The `currentSessionId` / `currentTermId`
  // fields hold the actual ObjectIds of the Session and Term documents,
  // and every gated feature (attendance, scores, invoices, report cards,
  // fee structures) reads these. They are populated on onboarding and can
  // be updated when the school advances to a new term.
  currentSession?: string;
  currentTerm?: string;
  currentSessionId?: string;
  currentTermId?: string;

  // Billing
  subscriptionId?: string;

  // SMS credits
  smsBalance: number;
  smsRate: number;          // Naira per SMS credit
  smsMonthlyUsage: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface ISchoolModel extends Model<ISchool> {
  // Instance helper — useful if the service layer wants to check SMS credit
  // balance without repeating the arithmetic everywhere.
  hasSmsCredits(this: ISchool, required?: number): boolean;
}

// ============================================================================
// SCHEMA
// ============================================================================

const SchoolSchema = new Schema<ISchool, ISchoolModel>(
  {
    // ----------------------------------------------------------------
    // Identity
    // ----------------------------------------------------------------
    name: {
      type: String,
      required: [true, 'School name is required'],
      trim: true,
      minlength: [2, 'School name must be at least 2 characters'],
      maxlength: [150, 'School name must be under 150 characters'],
    },

    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      // Not required here — a pre-save hook auto-generates it from `name`
      // if the caller omits it. Once set, it stays stable even if the name
      // changes (slugs should be immutable for link stability).
    },

    logo: { type: String, trim: true },
    motto: { type: String, trim: true, maxlength: 200 },

    // ----------------------------------------------------------------
    // Contact
    // ----------------------------------------------------------------
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
      maxlength: [300, 'Address must be under 300 characters'],
    },

    phone: {
      type: String,
      required: [true, 'Phone is required'],
      trim: true,
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      // Uniqueness is enforced by the index; a 409 is returned at the
      // service layer when a duplicate key error bubbles up.
    },

    website: { type: String, trim: true },

    // ----------------------------------------------------------------
    // Location
    // ----------------------------------------------------------------
    country: { type: String, trim: true, default: 'Nigeria' },
    state: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },

    timezone: {
      type: String,
      trim: true,
      default: 'Africa/Lagos',
    },

    currency: {
      type: String,
      enum: ['NGN', 'USD', 'GBP', 'EUR'],
      default: 'NGN',
    },

    // ----------------------------------------------------------------
    // Classification
    // ----------------------------------------------------------------
    schoolType: {
      type: String,
      enum: [
        'Nursery & Primary',
        'Primary Only',
        'Secondary Only',
        'Primary & Secondary',
      ],
      default: 'Primary & Secondary',
    },

    status: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'],
      default: 'ACTIVE',
      index: true,
    },

    // ----------------------------------------------------------------
    // Academic period
    // ----------------------------------------------------------------
    currentSession: { type: String, trim: true },
    currentTerm: { type: String, trim: true },

    // These are ObjectIds stored as strings so we don't have to populate
    // them on every read. Populated on onboarding (see
    // SchoolController.onboard) and updated when advancing terms.
    currentSessionId: { type: String, trim: true },
    currentTermId: { type: String, trim: true },

    // ----------------------------------------------------------------
    // Billing
    // ----------------------------------------------------------------
    subscriptionId: { type: String, trim: true },

    // ----------------------------------------------------------------
    // SMS credits
    // ----------------------------------------------------------------
    smsBalance: {
      type: Number,
      default: 0,
      min: [0, 'SMS balance cannot be negative'],
    },

    smsRate: {
      type: Number,
      default: 2000,   // ₦20 per SMS by default
      min: [0, 'SMS rate cannot be negative'],
    },

    smsMonthlyUsage: {
      type: Number,
      default: 0,
      min: [0, 'SMS monthly usage cannot be negative'],
    },
  },
  {
    timestamps: true,
    // toJSON/toObject transform: expose `id` instead of `_id` so the
    // frontend doesn't need to handle both, and strip internal-only fields
    // (`__v`).
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// ============================================================================
// INDEXES
// ============================================================================
// Compound indexes match the most common query patterns. Single-field
// indexes (slug, email, status) are declared inline above.

// Listing schools by status, sorted by creation date — used by the
// platform admin dashboard.
SchoolSchema.index({ status: 1, createdAt: -1 });

// Searching by state (filter on platform admin schools list).
SchoolSchema.index({ state: 1 });

// Text search across the fields a user would realistically search by.
SchoolSchema.index(
  { name: 'text', address: 'text', email: 'text' },
  { name: 'school_text_search', weights: { name: 5, email: 3, address: 1 } }
);

// ============================================================================
// HOOKS
// ============================================================================

// ---------------------------------------------------------------------------
// Slug generation
// ---------------------------------------------------------------------------
// Runs on save. If a slug is missing, generate one from the name. The slug
// is intentionally NOT regenerated when the name changes — slug stability
// matters for any shareable links.
//
// Collision note: this hook only generates a candidate slug. If two schools
// share a name, the second save will fail on the unique index. The service
// layer (SchoolService.create) catches that and retries with a short random
// suffix. Keeping the retry logic out of the model avoids the model needing
// to know about transient duplicate-key errors.
SchoolSchema.pre('save', function (next) {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .trim()
      .replace(/['"`]/g, '')          // strip quotes/apostrophes (St. Mary's)
      .replace(/&/g, ' and ')          // "Nursery & Primary" → "nursery and primary"
      .replace(/[^a-z0-9]+/g, '-')     // any non-alphanumeric → single dash
      .replace(/^-+|-+$/g, '')         // trim leading/trailing dashes
      .replace(/-{2,}/g, '-');         // collapse multi-dashes
  }
  next();
});

// ---------------------------------------------------------------------------
// Email normalization
// ---------------------------------------------------------------------------
// The schema already lowercases and trims, but we also defend against
// callers that bypass the schema (e.g. findByIdAndUpdate with an unlowercased
// email). This hook catches those.
SchoolSchema.pre('save', function (next) {
  if (this.isModified('email') && this.email) {
    this.email = this.email.toLowerCase().trim();
  }
  next();
});

// ============================================================================
// INSTANCE METHODS
// ============================================================================

SchoolSchema.methods.hasSmsCredits = function (
  this: ISchool,
  required: number = 1
): boolean {
  return this.smsBalance >= required;
};

// ============================================================================
// STATICS
// ============================================================================
// These wrap common queries so services don't repeat filter objects. Optional
// but keeps the surface area small and the code DRY.

SchoolSchema.statics.findBySlug = function (slug: string) {
  return this.findOne({ slug: slug.toLowerCase().trim() });
};

SchoolSchema.statics.findActive = function () {
  return this.find({ status: 'ACTIVE' });
};

// ============================================================================
// MODEL
// ============================================================================

export const School = mongoose.model<ISchool, ISchoolModel>('School', SchoolSchema);

export default School;
