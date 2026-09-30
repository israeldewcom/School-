// src/core/notifications/notification.service.ts
import mongoose from 'mongoose';
import { Notification } from '../../models/Notification';
import { Student } from '../../models/Student';
import { User } from '../../models/User';
import logger from '../../config/logger';

export interface NotifyPayload {
  title?: string;
  body: string;
  metadata?: any;
}

function uniqueIds(ids: Array<any>): string[] {
  const out = new Set<string>();
  for (const id of ids || []) {
    const s = String(id || '');
    if (/^[a-f\d]{24}$/i.test(s)) out.add(s);
  }
  return [...out];
}

export class NotificationService {
  static async create(data: any) {
    const notif = new Notification(data);
    await notif.save();
    return notif;
  }

  static async getForUser(userId: string, schoolId: string) {
    return Notification.find({ recipientId: userId, schoolId })
      .sort({ createdAt: -1 })
      .limit(200);
  }

  static async unreadCount(userId: string, schoolId: string) {
    return Notification.countDocuments({ recipientId: userId, schoolId, read: false });
  }

  static async markRead(id: string, userId: string, schoolId: string) {
    return Notification.findOneAndUpdate(
      { _id: id, recipientId: userId, schoolId },
      { read: true },
      { new: true }
    );
  }

  static async markAllRead(userId: string, schoolId: string) {
    const res = await Notification.updateMany(
      { recipientId: userId, schoolId, read: false },
      { $set: { read: true } }
    );
    return { updated: res.modifiedCount };
  }

  /**
   * Create an in-app notification for each user id. Never throws:
   * a notification failure must not break the action that triggered it.
   */
  static async notifyUsers(schoolId: string, userIds: any[], payload: NotifyPayload): Promise<number> {
    try {
      const ids = uniqueIds(userIds);
      if (ids.length === 0) return 0;
      const docs = ids.map((recipientId) => ({
        schoolId,
        recipientId: new mongoose.Types.ObjectId(recipientId),
        type: 'IN_APP' as const,
        channel: 'IN_APP',
        title: payload.title,
        body: payload.body,
        read: false,
        metadata: payload.metadata,
      }));
      await Notification.insertMany(docs, { ordered: false });
      return docs.length;
    } catch (err: any) {
      logger.warn(`notifyUsers failed: ${err?.message}`);
      return 0;
    }
  }

  /**
   * Notify every parent login linked to these students, plus the
   * students' own logins. Used when results are published, invoices are
   * issued, or class-targeted announcements go out.
   */
  static async notifyStudentFamilies(
    schoolId: string,
    studentIds: any[],
    payload: NotifyPayload
  ): Promise<number> {
    try {
      const ids = uniqueIds(studentIds);
      if (ids.length === 0) return 0;

      const students = await Student.find({ _id: { $in: ids }, schoolId })
        .select('parentIds')
        .lean();
      const parentIds = uniqueIds(students.flatMap((s: any) => s.parentIds || []));

      const [parentUsers, studentUsers] = await Promise.all([
        parentIds.length
          ? User.find({ schoolId, role: 'PARENT', isActive: true, parentId: { $in: parentIds } })
              .select('_id')
              .lean()
          : Promise.resolve([]),
        User.find({ schoolId, role: 'STUDENT', isActive: true, studentId: { $in: ids } })
          .select('_id')
          .lean(),
      ]);

      return await NotificationService.notifyUsers(
        schoolId,
        [...parentUsers, ...studentUsers].map((u: any) => u._id),
        payload
      );
    } catch (err: any) {
      logger.warn(`notifyStudentFamilies failed: ${err?.message}`);
      return 0;
    }
  }
}
