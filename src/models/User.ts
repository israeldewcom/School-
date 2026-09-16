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

export interface IUser extends Document {
  schoolId?: mongoose.Types.ObjectId;
  username: string;
  password: string;

  // Display fields — both shapes are kept because the auth service and
  // the credential manager use different conventions.
  name: string;              // full display name
  firstName?: string;        // legacy — kept for auth.service.ts
  lastName?: string;         // legacy — kept for auth.service.ts

  email?: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;

  // Refresh tokens for JWT rotation. The auth service reads/writes this
  // array directly, so it must exist on the schema even if unused by
  // newer flows.
  refreshTokens: string[];

  // Legacy lastLogin field — auth.service.ts writes to this on login.
  lastLogin?: Date;
  // Newer alias kept in sync for consumers that read `lastLoginAt`.
  lastLoginAt?: Date;

  // Link to a Staff or Parent record. Set for non-admin roles so the
  // account ties back to a real person.
  staffId?: mongoose.Types.ObjectId;
  parentId?: mongoose.Types.ObjectId;

  // Role-scoped fields.
  //   FORM_TEACHER    → formClassId (exactly one class)
  //   SUBJECT_TEACHER → subjectIds (references Subject docs, each
  //                     with its own classIds array)
  //   PARENT          → parentId
  // Other roles ignore these.
  formClassId?: mongoose.Types.ObjectId;
  subjectIds?: mongoose.Types.ObjectId[];

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
    role: {
      type: String,
      enum: [
        'SUPER_ADMIN',
        'SCHOOL_OWNER',
        'ADMIN',
        'HEAD_TEACHER',
        'FORM_TEACHER',
        'SUBJECT_TEACHER',
        'BURSAR',
        'PARENT',
        'STAFF',
      ],
      required: true,
      index: true,
    },
    isActive: { type: Boolean, default: true },

    refreshTokens: { type: [String], default: [] },

    lastLogin: { type: Date },
    lastLoginAt: { type: Date },

    staffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    parentId: { type: Schema.Types.ObjectId, ref: 'Parent' },

    formClassId: { type: Schema.Types.ObjectId, ref: 'Class' },
    subjectIds: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],
  },
  { timestamps: true }
);

UserSchema.index({ schoolId: 1, username: 1 }, { unique: true, sparse: true });

// Derive `name` from firstName/lastName when only those are provided,
// and vice versa. Keeps both conventions coherent without requiring
// callers to always supply every field.
UserSchema.pre('save', function (next) {
  if (!this.name && (this.firstName || this.lastName)) {
    this.name = `${this.firstName || ''} ${this.lastName || ''}`.trim();
  }
  if (this.name && (!this.firstName || !this.lastName)) {
    const parts = String(this.name).split(' ').filter(Boolean);
    if (!this.firstName && parts[0]) this.firstName = parts[0];
    if (!this.lastName && parts.length > 1) this.lastName = parts.slice(1).join(' ');
  }
  next();
});

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    this.password = await argon2.hash(this.password);
    next();
  } catch (err) {
    next(err as Error);
  }
});

UserSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  try {
    return await argon2.verify(this.password, candidate);
  } catch {
    return false;
  }
};

export const User = mongoose.model<IUser>('User', UserSchema);
