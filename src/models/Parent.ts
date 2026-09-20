// src/models/Parent.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IParent extends Document {
  schoolId: mongoose.Types.ObjectId;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email?: string;
  relationship?: string;
  address?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ParentSchema = new Schema<IParent>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    fullName: { type: String, trim: true, index: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    relationship: { type: String, trim: true, default: 'Guardian' },
    address: { type: String, trim: true },
  },
  { timestamps: true }
);

ParentSchema.index({ schoolId: 1, phone: 1 });

ParentSchema.pre('save', function (next) {
  if (
    this.isNew ||
    this.isModified('firstName') ||
    this.isModified('lastName')
  ) {
    this.fullName = `${this.firstName || ''} ${this.lastName || ''}`.trim();
  }
  if (!this.relationship) this.relationship = 'Guardian';
  next();
});

export const Parent = mongoose.model<IParent>('Parent', ParentSchema);
