// src/models/User.ts
import mongoose, { Schema, Document } from 'mongoose';
import argon2 from 'argon2';

export type UserRole =
  | 'SUPER_ADMIN'
  | 'SCHOOL_OWNER'
  | 'ADMIN'
  | 'HEAD_TEACHER'
  | 'FORM_TEACHER'
  | 'SUBJECT_TEACHER'
  | 'BURSAR'
  | 'PARENT'
  | 'STAFF';

export const USER_ROLES: UserRole[] = [
  'SUPER_ADMIN',
  'SCHOOL_OWNER',
  'ADMIN',
  'HEAD_TEACHER',
  'FORM_TEACHER',
  'SUBJECT_TEACHER',
  'BURSAR',
  'PARENT',
  'STAFF',
];

export interface IUser extends Document {
  schoolId?: mongoose.Types.ObjectId;

  username: string;
  password: string;

  name: string;
  firstName?: string;
  lastName?: string;

  email?: string;
  phone?: string;

  role: UserRole;
  isActive: boolean;

  refreshTokens: string[];
  sessionStartedAt?: Date;

  lastLogin?: Date;
  lastLoginAt?: Date;

  staffId?: mongoose.Types.ObjectId;
  parentId?: mongoose.Types.ObjectId;
  formClassId?: mongoose.Types.ObjectId;
  subjectIds: mongoose.Types.ObjectId[];

  // ------------------------------------------------------------------
  // Delegated payment approval
  //
  // Only meaningful for BURSAR. When true, the bursar can approve and
  // reject payments exactly like the proprietor. The proprietor can
  // flip this at any time — the change takes effect on the next
  // request because the auth middleware reloads the user document.
  //
  // Tracked separately with audit fields so we know who granted it
  // and when.
  // ------------------------------------------------------------------
  canApprovePayments: boolean;
  canApprovePaymentsSetBy?: mongoose.Types.ObjectId;
  canApprovePaymentsSetAt?: Date;

  createdAt: Date;
  updatedAt: Date;

  comparePassword(candidate: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', index: true },
    username: { type: String, required: true, trim: true, lowercase: true },
    password: { type: String, required: true, select: false },

    name: { type: String, trim: true, default: '' },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },

    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },

    role: { type: String, enum: USER_ROLES, required: true, index: true },
    isActive: { type: Boolean, default: true, index: true },

    refreshTokens: { type: [String], default: [] },
    sessionStartedAt: { type: Date },
    lastLogin: { type: Date },
    lastLoginAt: { type: Date },

    staffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    parentId: { type: Schema.Types.ObjectId, ref: 'Parent' },
    formClassId: { type: Schema.Types.ObjectId, ref: 'Class' },
    subjectIds: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],

    canApprovePayments: { type: Boolean, default: false },
    canApprovePaymentsSetBy: { type: Schema.Types.ObjectId, ref: 'User' },
    canApprovePaymentsSetAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: any) {
        delete ret.password;
        delete ret.refreshTokens;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

UserSchema.index({ schoolId: 1, username: 1 }, { unique: true, sparse: true });
UserSchema.index(
  { schoolId: 1, email: 1 },
  { unique: true, sparse: true, partialFilterExpression: { email: { $type: 'string' } } }
);
UserSchema.index({ schoolId: 1, role: 1 });
UserSchema.index({ schoolId: 1, formClassId: 1 });
UserSchema.index({ schoolId: 1, parentId: 1 });

UserSchema.pre('save', function (next) {
  try {
    const nameChanged =
      this.isNew ||
      this.isModified('name') ||
      this.isModified('firstName') ||
      this.isModified('lastName');

    if (!nameChanged) return next();

    const hasFirstLast = !!(this.firstName || this.lastName);
    const hasFullName = !!(this.name && this.name.trim());

    if (hasFirstLast && (!hasFullName || this.isModified('firstName') || this.isModified('lastName'))) {
      this.name = `${this.firstName || ''} ${this.lastName || ''}`.trim();
    } else if (hasFullName && (!hasFirstLast || this.isModified('name'))) {
      const parts = String(this.name).trim().split(/\s+/);
      this.firstName = parts[0] || '';
      this.lastName = parts.slice(1).join(' ') || '';
    }

    next();
  } catch (err) {
    next(err as Error);
  }
});

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const pwd = String(this.password || '');
    const alreadyHashed =
      pwd.startsWith('$argon2') ||
      pwd.startsWith('$2a$') ||
      pwd.startsWith('$2b$') ||
      pwd.startsWith('$2y$');
    if (alreadyHashed) return next();

    this.password = await argon2.hash(pwd);
    next();
  } catch (err) {
    next(err as Error);
  }
});

UserSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  const stored = String(this.password || '');
  if (!stored || !candidate) return false;

  try {
    if (stored.startsWith('$argon2')) {
      return await argon2.verify(stored, candidate);
    }
    if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
      const bcrypt = await import('bcryptjs');
      return await bcrypt.compare(candidate, stored);
    }
    return false;
  } catch {
    return false;
  }
};

UserSchema.virtual('displayName').get(function () {
  return (
    this.name ||
    `${this.firstName || ''} ${this.lastName || ''}`.trim() ||
    this.username
  );
});

UserSchema.virtual('hasActiveSession').get(function () {
  return Array.isArray(this.refreshTokens) && this.refreshTokens.length > 0;
});

UserSchema.statics.findByUsername = function (username: string, schoolId?: string) {
  const filter: any = { username: String(username).toLowerCase().trim() };
  if (schoolId && mongoose.isValidObjectId(schoolId)) {
    filter.schoolId = schoolId;
  }
  return this.findOne(filter).select('+password');
};

UserSchema.statics.countByRole = async function (schoolId: string) {
  if (!mongoose.isValidObjectId(schoolId)) return {};
  const rows = await this.aggregate([
    { $match: { schoolId: new mongoose.Types.ObjectId(schoolId), isActive: true } },
    { $group: { _id: '$role', count: { $sum: 1 } } },
  ]);
  const out: Record<string, number> = {};
  for (const r of rows) out[r._id] = r.count;
  return out;
};

export const User = mongoose.model<IUser>('User', UserSchema);
