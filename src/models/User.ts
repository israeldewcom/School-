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
  name: string;
  email?: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;

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

  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;

  comparePassword(candidate: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', index: true },
    username: { type: String, required: true, trim: true, lowercase: true },
    password: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
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

    staffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    parentId: { type: Schema.Types.ObjectId, ref: 'Parent' },

    formClassId: { type: Schema.Types.ObjectId, ref: 'Class' },
    subjectIds: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],

    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

UserSchema.index({ schoolId: 1, username: 1 }, { unique: true, sparse: true });

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
