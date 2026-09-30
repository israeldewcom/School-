// src/models/Announcement.ts
import mongoose, { Schema, Document } from 'mongoose';

export type AnnouncementAudience = 'ALL' | 'PARENTS' | 'STUDENTS' | 'STAFF' | 'CLASSES';
export type AnnouncementStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type AnnouncementPriority = 'NORMAL' | 'IMPORTANT' | 'URGENT';

export interface IAnnouncement extends Document {
  schoolId: mongoose.Types.ObjectId;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  classIds: mongoose.Types.ObjectId[];
  status: AnnouncementStatus;
  priority: AnnouncementPriority;
  pinned: boolean;
  publishedAt?: Date;
  expiresAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AnnouncementSchema = new Schema<IAnnouncement>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 10000 },
    audience: {
      type: String,
      enum: ['ALL', 'PARENTS', 'STUDENTS', 'STAFF', 'CLASSES'],
      default: 'ALL',
    },
    classIds: [{ type: Schema.Types.ObjectId, ref: 'Class' }],
    status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], default: 'DRAFT' },
    priority: { type: String, enum: ['NORMAL', 'IMPORTANT', 'URGENT'], default: 'NORMAL' },
    pinned: { type: Boolean, default: false },
    publishedAt: { type: Date },
    expiresAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String },
  },
  { timestamps: true }
);

AnnouncementSchema.index({ schoolId: 1, status: 1, publishedAt: -1 });
AnnouncementSchema.index({ schoolId: 1, audience: 1, status: 1 });

export const Announcement = mongoose.model<IAnnouncement>('Announcement', AnnouncementSchema);
