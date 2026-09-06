import { Notification } from '../../models/Notification';

export class NotificationService {
  static async create(data: any) {
    const notif = new Notification(data);
    await notif.save();
    return notif;
  }

  static async getForUser(userId: string, schoolId: string) {
    return Notification.find({ recipientId: userId, schoolId }).sort({ createdAt: -1 });
  }

  static async markRead(id: string, userId: string, schoolId: string) {
    return Notification.findOneAndUpdate(
      { _id: id, recipientId: userId, schoolId },
      { read: true },
      { new: true }
    );
  }
}
