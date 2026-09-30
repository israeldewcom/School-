   import mongoose from 'mongoose';
import { Message } from '../../models/Message';
import { Notification } from '../../models/Notification';
import { Parent } from '../../models/Parent';
import { User } from '../../models/User';
import { smsQueue, emailQueue, safeQueueAdd } from '../../jobs/queues';
import { NotFoundError, BadRequestError } from '../../utils/errors';

export class CommunicationService {
  // ============================================================
  // BULK / GENERIC MESSAGING
  // ============================================================
  static async sendMessage(data: any) {
    const schoolId = String(data?.schoolId || '');
    if (!schoolId) throw new BadRequestError('School context is required');

    const type = String(data?.type || '').toUpperCase();

    // Only recipients that belong to THIS school are ever contacted.
    const requested: string[] = Array.isArray(data?.recipients)
      ? data.recipients.filter((id: any) => mongoose.isValidObjectId(String(id))).map(String)
      : [];

    const recipients = await User.find({
      _id: { $in: requested },
      schoolId,
      isActive: true,
    }).select('email phone');

    if (recipients.length === 0) {
      throw new BadRequestError('No valid recipients were found in your school.');
    }

    let queued = 0;
    for (const recipient of recipients) {
      if (type === 'EMAIL') {
        const email = recipient.email;
        // Skip the placeholder addresses generated for users without email.
        if (email && !email.endsWith('.local')) {
          await safeQueueAdd(emailQueue, 'send-email', {
            to: email,
            subject: data.subject,
            html: data.body,
          });
          queued += 1;
        }
      } else if (type === 'SMS') {
        if (recipient.phone) {
          await safeQueueAdd(smsQueue, 'send-sms', {
            schoolId,
            to: recipient.phone,
            message: data.body,
          });
          queued += 1;
        }
      }
    }

    if ((type === 'EMAIL' || type === 'SMS') && queued === 0) {
      throw new BadRequestError(
        type === 'EMAIL'
          ? 'None of the selected recipients have an email address on file.'
          : 'None of the selected recipients have a phone number on file.'
      );
    }

    const message = new Message({
      ...data,
      schoolId,
      recipients: recipients.map((r) => r._id),
    });
    message.status = 'SENT';
    await message.save();

    return message;
  }

  // ============================================================
  // PARENT SMS
  // ============================================================
  static async sendParentSMS(schoolId: string, parentId: string, message: string) {
    const parent = await Parent.findOne({ _id: parentId, schoolId });
    if (!parent) throw new NotFoundError('Parent not found');
    if (!parent.phone) throw new BadRequestError('This parent has no phone number on file');
    if (!message || !message.trim()) throw new BadRequestError('Message is required');

    await safeQueueAdd(smsQueue, 'send-sms', {
      schoolId,
      to: parent.phone,
      message: message.trim(),
    });

    return { queued: true, phone: parent.phone };
  }

  // ============================================================
  // MESSAGES
  // ============================================================
  static async getMessages(schoolId: string, query: any) {
    const { schoolId: _ignored, ...safeQuery } = query || {};
    return Message.find({ ...safeQuery, schoolId }).populate('sender recipients');
  }

  // ============================================================
  // NOTIFICATIONS
  // ============================================================
  static async getNotifications(recipientId: string, schoolId: string) {
    return Notification.find({ recipientId, schoolId }).sort({ createdAt: -1 });
  }

  static async markNotificationRead(notificationId: string, schoolId: string) {
    const notif = await Notification.findOneAndUpdate(
      { _id: notificationId, schoolId },
      { read: true },
      { new: true }
    );
    if (!notif) throw new NotFoundError('Notification not found');
    return notif;
  }
}
