import mongoose, { Schema, Document } from 'mongoose';
import argon2 from 'argon2';

export interface IUser extends Document {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  schoolId?: mongoose.Types.ObjectId;
  isActive: boolean;
  refreshTokens: string[];
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ACCOUNTANT', 'TEACHER', 'STAFF', 'PARENT'],
      required: true,
    },
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', index: true },
    isActive: { type: Boolean, default: true },
    refreshTokens: [{ type: String }],
    lastLogin: Date,
  },
  { timestamps: true }
);

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await argon2.hash(this.password);
  next();
});

UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return argon2.verify(this.password, candidatePassword);
};

export const User = mongoose.model<IUser>('User', UserSchema);
