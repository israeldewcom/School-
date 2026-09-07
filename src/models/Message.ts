import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
  schoolId: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  recipients: mongoose.Types.ObjectId[];
  subject: string;
  body: string;
  type: 'EMAIL' | 'SMS' | 'IN_APP';
  status: 'DRAFT' | 'SENT' | 'FAILED';
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipients: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    subject: { type: String, required: true },
    body: { type: String, required: true },
    type: { type: String, enum: ['EMAIL', 'SMS', 'IN_APP'], required: true },
    status: {
      type: String,
      enum: ['DRAFT', 'SENT', 'FAILED'],
      default: 'DRAFT',
    },
    sentAt: Date,
  },
  { timestamps: true }
);

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
