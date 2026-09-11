import { Message } from '../../models/Message';
import { Notification } from '../../models/Notification';
import { Parent } from '../../models/Parent';
import { User } from '../../models/User';
import { smsQueue, emailQueue } from '../../jobs/queues';
import { NotFoundError, BadRequestError } from '../../utils/errors';

export class CommunicationService {
  // ============================================================
  // BULK / GENERIC MESSAGING
  // ============================================================
  // Called by POST /communications/messages. Recipients are User ObjectIds
  // (school staff, other admins). For parent-facing SMS, use sendParentSMS
  // below — the Parent model has a phone field, User does not.
  static async sendMessage(data: any) {
    const message = new Message(data);
    message.status = 'SENT';
    await message.save();

    // Resolve the User documents so we can read email off them. The Message
    // document already stores the raw ObjectIds; here we need the actual
    // email strings to enqueue the email jobs.
    const recipients = await User.find({ _id: { $in: data.recipients || [] } });

    for (const recipient of recipients) {
      if (data.type === 'EMAIL' && recipient.email) {
        await emailQueue.add('send-email', {
          to: recipient.email,
          subject: data.subject,
          html: data.body,
        });
      }
      // SMS for Users isn't wired here because the User model has no phone
      // field. Use sendParentSMS for parent-facing SMS.
    }

    return message;
  }

  // ============================================================
  // PARENT SMS
  // ============================================================
  // Called by POST /communications/sms-to-parent. The Parent model has a
  // phone field directly, so no User lookup is needed. The schoolflow_sms
  // worker picks the job up and calls the Termii integration, deducting
  // credits from the school's SMS balance.
  static async sendParentSMS(schoolId: string, parentId: string, message: string) {
    const parent = await Parent.findOne({ _id: parentId, schoolId });
    if (!parent) throw new NotFoundError('Parent not found');
    if (!parent.phone) throw new BadRequestError('This parent has no phone number on file');
    if (!message || !message.trim()) throw new BadRequestError('Message is required');

    await smsQueue.add('send-sms', {
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
    // Whitelist: strip any `schoolId` the client might have sent so it can't
    // override the tenant scope. Same pattern used in StudentService and
    // ResultService.
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
