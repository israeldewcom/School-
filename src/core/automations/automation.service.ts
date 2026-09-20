// src/core/automations/automation.service.ts
import mongoose from 'mongoose';
import jsonLogic from 'json-logic-js';
import { Automation } from '../../models/Automation';
import { Invoice } from '../../models/Invoice';
import { Payment } from '../../models/Payment';
import { Attendance } from '../../models/Attendance';
import { smsQueue, emailQueue, safeQueueAdd } from '../../jobs/queues';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';
import logger from '../../config/logger';

interface AutomationAction {
  type: string;
  config?: any;
}

export class AutomationService {
  static async list(schoolId: string) {
    return Automation.find({ schoolId }).sort({ createdAt: -1 }).lean();
  }

  static async create(schoolId: string, data: any) {
    if (!data?.name || !String(data.name).trim()) {
      throw new BadRequestError('Rule name is required');
    }
    if (!data?.event) {
      throw new BadRequestError('Event is required');
    }
    const automation = new Automation({
      schoolId,
      name: String(data.name).trim(),
      event: data.event,
      condition: data.condition || '{}',
      actions: Array.isArray(data.actions) ? data.actions : [],
      isEnabled: data.isEnabled !== false,
    });
    await automation.save();
    return automation;
  }

  static async update(schoolId: string, id: string, data: any) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid automation id');
    const a = await Automation.findOne({ _id: id, schoolId });
    if (!a) throw new NotFoundError('Automation not found');
    if (data.name !== undefined) a.name = String(data.name).trim();
    if (data.event !== undefined) a.event = data.event;
    if (data.condition !== undefined) a.condition = data.condition;
    if (Array.isArray(data.actions)) a.actions = data.actions;
    if (data.isEnabled !== undefined) a.isEnabled = !!data.isEnabled;
    await a.save();
    return a;
  }

  static async toggle(schoolId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid automation id');
    const a = await Automation.findOne({ _id: id, schoolId });
    if (!a) throw new NotFoundError('Automation not found');
    a.isEnabled = !a.isEnabled;
    await a.save();
    return a;
  }

  static async delete(schoolId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid automation id');
    const a = await Automation.findOneAndDelete({ _id: id, schoolId });
    if (!a) throw new NotFoundError('Automation not found');
    return { deleted: true };
  }

  static async test(schoolId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError('Invalid automation id');
    const a = await Automation.findOne({ _id: id, schoolId }).lean();
    if (!a) throw new NotFoundError('Automation not found');

    const result = await AutomationService.evaluate(a as any, schoolId);
    return {
      automationId: id,
      event: (a as any).event,
      matched: result.matched,
      actions: result.actions,
      sample: result.sample,
    };
  }

  // ------------------------------------------------------------------
  // Runner — called by the automation worker on a schedule.
  // ------------------------------------------------------------------
  static async runAll(schoolId: string) {
    const automations = await Automation.find({ schoolId, isEnabled: true }).lean();
    const summary: any[] = [];

    for (const a of automations) {
      try {
        const result = await AutomationService.evaluate(a as any, schoolId);
        summary.push({
          id: String((a as any)._id),
          name: (a as any).name,
          event: (a as any).event,
          matched: result.matched,
          dispatched: result.actions,
        });
      } catch (err: any) {
        summary.push({
          id: String((a as any)._id),
          name: (a as any).name,
          error: err?.message,
        });
      }
    }
    return { ran: automations.length, summary };
  }

  private static async evaluate(automation: any, schoolId: string) {
    const event: string = automation.event;
    let candidates: any[] = [];
    let sample: any = null;

    switch (event) {
      case 'fee_overdue':
        candidates = await AutomationService.findOverdueInvoices(schoolId);
        break;
      case 'payment_received':
        candidates = await AutomationService.findRecentPayments(schoolId);
        break;
      case 'attendance_low':
        candidates = await AutomationService.findLowAttendance(schoolId);
        break;
      case 'invoice_issued':
        candidates = await AutomationService.findRecentInvoices(schoolId);
        break;
      default:
        return { matched: 0, actions: 0, sample: null };
    }

    // Apply the JSON-Logic condition if set.
    let condition: any = null;
    try {
      condition = automation.condition ? JSON.parse(automation.condition) : null;
    } catch (_) {}

    const matched = condition
      ? candidates.filter((c) => {
          try { return jsonLogic.apply(condition, c); } catch (_) { return false; }
        })
      : candidates;

    if (matched.length > 0) sample = matched[0];

    // Dispatch actions.
    let dispatched = 0;
    for (const row of matched) {
      for (const action of (automation.actions || []) as AutomationAction[]) {
        try {
          await AutomationService.dispatch(action, row, schoolId);
          dispatched++;
        } catch (err: any) {
          logger.warn(`Automation action failed: ${err?.message}`);
        }
      }
    }

    return { matched: matched.length, actions: dispatched, sample };
  }

  private static async findOverdueInvoices(schoolId: string) {
    // Compute the balance in the query since `balance` may not be set
    // on every legacy invoice. Fall back to total - amountPaid.
    const invoices = await Invoice.find({
      schoolId,
      status: { $in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
      dueDate: { $lt: new Date() },
    })
      .populate('studentId', 'fullName firstName lastName')
      .lean()
      .exec();

    return (invoices as any[]).map((inv) => {
      const balance =
        typeof inv.balance === 'number'
          ? inv.balance
          : Math.max((inv.total || 0) - (inv.amountPaid || 0), 0);

      return {
        invoiceId: String(inv._id),
        invoiceNumber: inv.invoiceNumber,
        studentId: inv.studentId?._id ? String(inv.studentId._id) : String(inv.studentId),
        studentName:
          inv.studentId?.fullName ||
          `${inv.studentId?.firstName || ''} ${inv.studentId?.lastName || ''}`.trim(),
        total: inv.total,
        amountPaid: inv.amountPaid,
        balance,
        daysOverdue: inv.dueDate
          ? Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000)
          : 0,
      };
    });
  }

  private static async findRecentPayments(schoolId: string) {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const payments = await Payment.find({
      schoolId,
      status: { $in: ['APPROVED', 'CONFIRMED'] },
      createdAt: { $gte: since },
    })
      .populate('studentId', 'fullName firstName lastName')
      .lean()
      .exec();

    return (payments as any[]).map((p) => ({
      paymentId: String(p._id),
      studentId: p.studentId?._id ? String(p.studentId._id) : String(p.studentId),
      studentName:
        p.studentId?.fullName ||
        `${p.studentId?.firstName || ''} ${p.studentId?.lastName || ''}`.trim(),
      amount: p.amount,
      method: p.method,
    }));
  }

  private static async findLowAttendance(schoolId: string) {
    const since = new Date(Date.now() - 7 * 86400000);
    const agg = await Attendance.aggregate([
      { $match: { schoolId: new mongoose.Types.ObjectId(schoolId), date: { $gte: since } } },
      {
        $group: {
          _id: '$studentId',
          present: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } },
          total: { $sum: 1 },
        },
      },
      { $match: { total: { $gte: 3 } } },
    ]);

    return agg.map((row: any) => ({
      studentId: String(row._id),
      presentRate: row.total > 0 ? Math.round((row.present / row.total) * 100) : 0,
      present: row.present,
      total: row.total,
    }));
  }

  private static async findRecentInvoices(schoolId: string) {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const invoices = await Invoice.find({ schoolId, createdAt: { $gte: since } })
      .populate('studentId', 'fullName firstName lastName')
      .lean()
      .exec();

    return (invoices as any[]).map((inv) => ({
      invoiceId: String(inv._id),
      invoiceNumber: inv.invoiceNumber,
      studentId: inv.studentId?._id ? String(inv.studentId._id) : String(inv.studentId),
      studentName:
        inv.studentId?.fullName ||
        `${inv.studentId?.firstName || ''} ${inv.studentId?.lastName || ''}`.trim(),
      total: inv.total,
    }));
  }

  private static async dispatch(action: AutomationAction, row: any, schoolId: string) {
    const type = String(action.type || '').toUpperCase();
    if (type === 'SMS') {
      if (!row.phone) return;
      await safeQueueAdd(smsQueue, 'automation-sms', {
        schoolId,
        to: row.phone,
        message: renderTemplate(action.config?.message || 'Reminder from school', row),
      });
    } else if (type === 'EMAIL') {
      if (!row.email) return;
      await safeQueueAdd(emailQueue, 'automation-email', {
        schoolId,
        to: row.email,
        subject: action.config?.subject || 'SchoolFlow',
        body: renderTemplate(action.config?.body || '', row),
      });
    } else if (type === 'IN-APP NOTIFICATION' || type === 'IN_APP') {
      // Placeholder — the notification service can be wired here.
      logger.debug(`In-app notification queued for ${row.studentName || row.studentId}`);
    } else if (type === 'WEBHOOK') {
      // Placeholder — an HTTP POST would fire here.
      logger.debug(`Webhook would fire for ${row.studentId}`);
    }
  }
}

function renderTemplate(template: string, data: any): string {
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = data[key];
    return v === undefined || v === null ? '' : String(v);
  });
}
