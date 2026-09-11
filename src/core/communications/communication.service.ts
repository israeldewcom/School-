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
    const message = new Message(data);
    message.status = 'SENT';
    await message.save();

    const recipients = await User.find({ _id: { $in: data.recipients || [] } });

    for (const recipient of recipients) {
      if (data.type === 'EMAIL' && recipient.email) {
        await safeQueueAdd(emailQueue, 'send-email', {
          to: recipient.email,
          subject: data.subject,
          html: data.body,
        });
      }
    }

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
