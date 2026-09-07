import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  schoolId: mongoose.Types.ObjectId;
  recipientId: mongoose.Types.ObjectId;
  type: 'EMAIL' | 'SMS' | 'IN_APP';
  channel: string;
  title?: string;
  body: string;
  read: boolean;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    recipientId: { type: Schema.Types.ObjectId, required: true, index: true },
    type: { type: String, enum: ['EMAIL', 'SMS', 'IN_APP'], required: true },
    channel: { type: String, required: true },
    title: String,
    body: { type: String, required: true },
    read: { type: Boolean, default: false },
    metadata: Schema.Types.Mixed,
  },
  { timestamps: true }
);

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
