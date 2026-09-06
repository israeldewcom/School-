import { Message } from '../../models/Message';
import { Notification } from '../../models/Notification';
import { smsQueue, emailQueue } from '../../jobs/queues';
import { NotFoundError } from '../../utils/errors';

export class CommunicationService {
  static async sendMessage(data: any) {
    const message = new Message(data);
    message.status = 'SENT'; // will be updated after actual send
    await message.save();

    // Queue sending
    for (const recipient of data.recipients) {
      if (data.type === 'EMAIL') {
        await emailQueue.add('send-email', {
          to: recipient.email, // need to fetch email from User
          subject: data.subject,
          html: data.body,
        });
      } else if (data.type === 'SMS') {
        await smsQueue.add('send-sms', {
          to: recipient.phone,
          message: data.body,
        });
      }
    }

    return message;
  }

  static async getMessages(schoolId: string, query: any) {
    return Message.find({ schoolId, ...query }).populate('sender recipients');
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
