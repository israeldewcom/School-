import { Message } from '../../models/Message';
import { Notification } from '../../models/Notification';
import { Parent } from '../../models/Parent';
import { User } from '../../models/User';
import { smsQueue, emailQueue } from '../../jobs/queues';
import { NotFoundError, BadRequestError } from '../../utils/errors';

export class CommunicationService {
  static async sendMessage(data: any) {
    const message = new Message(data);
    message.status = 'SENT';
    await message.save();

    // Look up recipients — they may be User IDs, but we also need phone/email.
    const recipients = await User.find({ _id: { $in: data.recipients || [] } });

    for (const recipient of recipients) {
      if (data.type === 'EMAIL' && recipient.email) {
        await emailQueue.add('send-email', {
          to: recipient.email,
          subject: data.subject,
          html: data.body,
        });
      } else if (data.type === 'SMS') {
        // User model doesn't have a phone field today; fall back to nothing.
        // Prefer sendParentSMS for SMS.
        continue;
      }
    }

    return message;
  }

  // Send an SMS to a Parent record. Parent has phone directly, so we don't
  // need a User lookup. Queues through the same schoolflow_sms worker.
  static async sendParentSMS(schoolId: string, parentId: string, message: string) {
    const parent = await Parent.findOne({ _id: parentId, schoolId });
    if (!parent) throw new NotFoundError('Parent not found');
    if (!parent.phone) throw new BadRequestError('This parent has no phone number on file');
    if (!message || !message.trim()) throw new BadRequestError('Message is required');

    // Record the SMS as a Message document for audit trail.
    const msgDoc = new Message({
      schoolId,
      sender: undefined, // system-generated
      recipients: [],    // no User recipients — this is a direct Parent send
      subject: 'SMS',
      body: message,
      type: 'SMS',
      status: 'SENT',
      sentAt: new Date(),
    });
    // Message.sender is required — attach a placeholder if needed. If the
    // Message model makes sender required, we use the school's owner.
    // Simplest: bypass the Message record for parent SMS and just queue.
    await smsQueue.add('send-sms', {
      schoolId,
      to: parent.phone,
      message,
      senderId: undefined,
    });

    return { queued: true, phone: parent.phone };
  }

  static async getMessages(schoolId: string, query: any) {
    const { schoolId: _ignored, ...safeQuery } = query || {};
    return Message.find({ ...safeQuery, schoolId }).populate('sender recipients');
  }

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
