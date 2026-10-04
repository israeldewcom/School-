// src/services/notifier.service.ts
//
// One entry point for "tell the family / staff about X". Always creates an
// in-app notification; also queues SMS (and email when an address exists)
// when the caller asks for it and the school has SMS credits.
import mongoose from 'mongoose';
import { School } from '../models/School';
import { Student } from '../models/Student';
import { Parent } from '../models/Parent';
import { User } from '../models/User';
import { NotificationService } from '../core/notifications/notification.service';
import { smsQueue, emailQueue, safeQueueAdd } from '../jobs/queues';
import { normalizePhone } from '../utils/phone';
import logger from '../config/logger';

export type SmsSetting =
  | 'smsOnPayment'
  | 'smsOnAbsence'
  | 'smsOnReportCard'
  | 'smsOnAssignment'
  | 'smsOnAdmission';

export interface FamilyNotice {
  title: string;
  body: string;
  /** Short SMS text. Omit to send in-app only. */
  sms?: string;
  /** Which school switch controls the SMS. */
  smsSetting?: SmsSetting;
  metadata?: any;
}

export class Notifier {
  // Remember when each school was last warned about SMS credit (once per 24h per school).
  private static smsWarned = new Map<string, number>();

  /** Tell the owner/admins (in-app) that SMS credit is empty or low. Throttled, never throws. */
  private static async warnSmsCredit(schoolId: string, balance: number): Promise<void> {
    try {
      const last = Notifier.smsWarned.get(schoolId) || 0;
      if (Date.now() - last < 24 * 60 * 60 * 1000) return;
      Notifier.smsWarned.set(schoolId, Date.now());
      const empty = balance < 1;
      await Notifier.admins(
        schoolId,
        empty ? 'SMS credit finished' : 'SMS credit is low',
        empty
          ? 'Your school has no SMS credit left, so parents are only receiving in-app notices. Top up SMS credit to resume SMS alerts.'
          : `Only ${balance} SMS credits remain. Top up soon so parents keep receiving SMS alerts.`,
        { type: 'sms_credit', balance }
      );
    } catch (_) {}
  }

  /** Queue a single SMS if the school has credits. Never throws. */
  static async sms(schoolId: string, phone: any, message: string): Promise<boolean> {
    try {
      const to = normalizePhone(phone);
      if (!to || !message) return false;
      const school: any = await School.findById(schoolId).select('smsBalance').lean();
      const balance = school?.smsBalance || 0;
      if (!school || balance < 1) {
        void Notifier.warnSmsCredit(schoolId, 0); // tell the admins instead of failing silently
        return false;
      }
      if (balance < 50) void Notifier.warnSmsCredit(schoolId, balance);
      const job = await safeQueueAdd(smsQueue, 'send-sms', { schoolId, to, message });
      return !!job;
    } catch (err: any) {
      logger.warn(`Notifier.sms failed: ${err?.message}`);
      return false;
    }
  }

  static async email(to: any, subject: string, html: string): Promise<boolean> {
    try {
      const addr = String(to || '').trim();
      if (!addr || addr.endsWith('.local')) return false;
      const job = await safeQueueAdd(emailQueue, 'send-email', { to: addr, subject, html });
      return !!job;
    } catch (_) {
      return false;
    }
  }

  /** In-app notification to specific user ids. */
  static async users(schoolId: string, userIds: any[], title: string, body: string, metadata?: any) {
    return NotificationService.notifyUsers(schoolId, userIds, { title, body, metadata });
  }

  /** Owners + admins of the school (new application, payment to approve, etc.). */
  static async admins(schoolId: string, title: string, body: string, metadata?: any) {
    try {
      const admins = await User.find({
        schoolId,
        isActive: true,
        role: { $in: ['SCHOOL_OWNER', 'ADMIN'] },
      })
        .select('_id')
        .lean();
      return Notifier.users(schoolId, admins.map((a: any) => a._id), title, body, metadata);
    } catch (_) {
      return 0;
    }
  }

  /**
   * Notify the parents (and student logins) of the given students.
   * SMS goes to each distinct parent phone once, even with several children.
   */
  static async families(schoolId: string, studentIds: any[], notice: FamilyNotice): Promise<{ inApp: number; sms: number }> {
    const out = { inApp: 0, sms: 0 };
    try {
      const ids = [...new Set((studentIds || []).map((s) => String(s)).filter((s) => mongoose.isValidObjectId(s)))];
      if (ids.length === 0) return out;

      out.inApp = await NotificationService.notifyStudentFamilies(schoolId, ids, {
        title: notice.title,
        body: notice.body,
        metadata: notice.metadata,
      });

      if (!notice.sms) return out;

      const school: any = await School.findById(schoolId).select('notificationSettings').lean();
      const settings = school?.notificationSettings || {};
      if (notice.smsSetting && settings[notice.smsSetting] === false) return out;

      const students: any[] = await Student.find({ _id: { $in: ids }, schoolId }).select('parentIds').lean();
      const parentIds = [...new Set(students.flatMap((s) => (s.parentIds || []).map((p: any) => String(p))))];
      if (parentIds.length === 0) return out;

      const parents: any[] = await Parent.find({ _id: { $in: parentIds }, schoolId }).select('phone email').lean();
      const seen = new Set<string>();
      for (const p of parents) {
        const key = normalizePhone(p.phone);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        if (await Notifier.sms(schoolId, p.phone, notice.sms)) out.sms += 1;
      }
    } catch (err: any) {
      logger.warn(`Notifier.families failed: ${err?.message}`);
    }
    return out;
  }
}
