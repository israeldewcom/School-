// src/core/automations/automation.service.ts
import mongoose from 'mongoose';
import { Automation } from '../../models/Automation';
import logger from '../../config/logger';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';

const VALID_ACTIONS = [
  'SMS',
  'EMAIL',
  'IN_APP',
  'WEBHOOK',
  'SMS_TO_PARENT',
  'SMS_TO_STAFF',
] as const;

const VALID_EVENTS = [
  'fee_overdue',
  'payment_received',
  'attendance_low',
  'invoice_issued',
  'term_closed',
  'student_enrolled',
] as const;

export class AutomationService {
  /**
   * List automations for a school. Optional filters: event, isEnabled.
   */
  static async getAll(schoolId: string, query: any = {}) {
    const filter: any = { schoolId };
    if (query?.event) filter.event = query.event;
    if (query?.isEnabled !== undefined) {
      filter.isEnabled = query.isEnabled === true || query.isEnabled === 'true';
    }
    return Automation.find(filter).sort({ createdAt: -1 }).lean();
  }

  /**
   * Alias for getAll — some call sites use `list`.
   */
  static async list(schoolId: string, query: any = {}) {
    return AutomationService.getAll(schoolId, query);
  }

  static async getById(schoolId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestError('Invalid automation id');
    }
    const doc = await Automation.findOne({ _id: id, schoolId }).lean();
    if (!doc) throw new NotFoundError('Automation not found');
    return doc;
  }

  static async create(schoolId: string, data: any) {
    const name = String(data?.name || '').trim();
    const event = String(data?.event || '').trim();

    if (!name) throw new BadRequestError('Automation name is required');
    if (!event) throw new BadRequestError('Event is required');
    if (!(VALID_EVENTS as readonly string[]).includes(event)) {
      throw new BadRequestError(
        `Unsupported event. Must be one of: ${VALID_EVENTS.join(', ')}`
      );
    }

    const actions = Array.isArray(data?.actions) ? data.actions : [];
    if (actions.length === 0) {
      throw new BadRequestError('At least one action is required');
    }
    for (const a of actions) {
      if (!a || !(VALID_ACTIONS as readonly string[]).includes(a.type)) {
        throw new BadRequestError(
          `Invalid action type. Must be one of: ${VALID_ACTIONS.join(', ')}`
        );
      }
    }

    // Condition arrives as either a string or an object. Normalize to a
    // validated JSON string (JSON-Logic).
    let condition: string | undefined;
    if (data?.condition !== undefined && data?.condition !== null) {
      const raw =
        typeof data.condition === 'string'
          ? data.condition
          : JSON.stringify(data.condition);
      try {
        JSON.parse(raw);
      } catch (_) {
        throw new BadRequestError('Condition must be valid JSON');
      }
      condition = raw;
    }

    const doc = await Automation.create({
      schoolId,
      name,
      event,
      condition,
      actions,
      isEnabled: data?.isEnabled !== false,
    });

    return AutomationService.getById(schoolId, String(doc._id));
  }

  static async update(schoolId: string, id: string, data: any) {
    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestError('Invalid automation id');
    }
    const doc = await Automation.findOne({ _id: id, schoolId });
    if (!doc) throw new NotFoundError('Automation not found');

    if (data?.name !== undefined) doc.name = String(data.name).trim();

    if (data?.event !== undefined) {
      const ev = String(data.event).trim();
      if (!(VALID_EVENTS as readonly string[]).includes(ev)) {
        throw new BadRequestError(
          `Unsupported event. Must be one of: ${VALID_EVENTS.join(', ')}`
        );
      }
      doc.event = ev;
    }

    if (data?.isEnabled !== undefined) doc.isEnabled = !!data.isEnabled;

    if (data?.actions !== undefined) {
      if (!Array.isArray(data.actions) || data.actions.length === 0) {
        throw new BadRequestError('At least one action is required');
      }
      for (const a of data.actions) {
        if (!a || !(VALID_ACTIONS as readonly string[]).includes(a.type)) {
          throw new BadRequestError(
            `Invalid action type. Must be one of: ${VALID_ACTIONS.join(', ')}`
          );
        }
      }
      doc.actions = data.actions;
    }

    if (data?.condition !== undefined) {
      if (data.condition === null) {
        doc.condition = undefined;
      } else {
        const raw =
          typeof data.condition === 'string'
            ? data.condition
            : JSON.stringify(data.condition);
        try {
          JSON.parse(raw);
        } catch (_) {
          throw new BadRequestError('Condition must be valid JSON');
        }
        doc.condition = raw;
      }
    }

    await doc.save();
    return AutomationService.getById(schoolId, id);
  }

  static async toggle(schoolId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestError('Invalid automation id');
    }
    const doc = await Automation.findOne({ _id: id, schoolId });
    if (!doc) throw new NotFoundError('Automation not found');

    doc.isEnabled = !doc.isEnabled;
    await doc.save();
    return { id: String(doc._id), isEnabled: doc.isEnabled };
  }

  static async delete(schoolId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestError('Invalid automation id');
    }
    const doc = await Automation.findOneAndDelete({ _id: id, schoolId });
    if (!doc) throw new NotFoundError('Automation not found');
    return { deleted: true, id };
  }

  /**
   * Execute (dry-run) an automation against a payload. Used by the
   * /automations/:id/test endpoint. Does not queue real SMS or email —
   * it evaluates the condition and reports which actions would run.
   */
  static async triggerAutomation(
    schoolId: string,
    id: string,
    payload: any = {}
  ) {
    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestError('Invalid automation id');
    }
    const doc = await Automation.findOne({ _id: id, schoolId });
    if (!doc) throw new NotFoundError('Automation not found');

    const conditionMatches = evaluateCondition(doc.condition, payload);

    const result = {
      automationId: String(doc._id),
      name: doc.name,
      event: doc.event,
      isEnabled: doc.isEnabled,
      condition: doc.condition || null,
      payload,
      conditionMatches,
      actions: (doc.actions || []).map((a) => ({
        type: a.type,
        config: a.config || {},
        wouldRun: conditionMatches && doc.isEnabled,
      })),
      evaluatedAt: new Date().toISOString(),
    };

    // Record run metadata (best effort — don't fail the test if this
    // write fails).
    doc.lastRunAt = new Date();
    doc.lastRunStatus = conditionMatches ? 'SUCCESS' : 'SKIPPED';
    doc.lastRunMessage = conditionMatches
      ? `Condition matched. ${doc.actions?.length || 0} action(s) would run.`
      : 'Condition did not match — no actions would run.';
    doc.runCount = (doc.runCount || 0) + 1;
    try {
      await doc.save();
    } catch (err: any) {
      logger.warn(`automation test: could not persist run metadata — ${err?.message}`);
    }

    return result;
  }
}

// =============================================================
// Minimal JSON-Logic style evaluator
// =============================================================
// Supports the operators commonly used by SchoolFlow automations:
//   ==, ===, !=, !==, >, >=, <, <=, and, or, not, in
//   {"var": "path.to.field"}
// Anything else evaluates to false so a malformed condition never
// accidentally fires an action.

function evaluateCondition(condition: string | undefined, payload: any): boolean {
  if (!condition) return true; // no condition = always fire
  let parsed: any;
  try {
    parsed = JSON.parse(condition);
  } catch (_) {
    return false;
  }
  return evalNode(parsed, payload);
}

function evalNode(node: any, data: any): boolean {
  if (node == null) return false;
  if (typeof node === 'boolean') return node;
  if (typeof node !== 'object') return false;

  if (Array.isArray(node)) {
    const [op, ...args] = node;
    const vals = args.map((a) => evalArg(a, data));

    switch (op) {
      case '==':  return vals[0] == vals[1];
      case '===': return vals[0] === vals[1];
      case '!=':  return vals[0] != vals[1];
      case '!==': return vals[0] !== vals[1];
      case '>':   return Number(vals[0]) > Number(vals[1]);
      case '>=':  return Number(vals[0]) >= Number(vals[1]);
      case '<':   return Number(vals[0]) < Number(vals[1]);
      case '<=':  return Number(vals[0]) <= Number(vals[1]);
      case 'and': return vals.every((v) => !!v);
      case 'or':  return vals.some((v) => !!v);
      case 'not': return !vals[0];
      case 'in':  return Array.isArray(vals[1]) && vals[1].includes(vals[0]);
      default:    return false;
    }
  }

  // Object form: {"gte": [{"var":"x"}, 7]} or {"var": "x"}
  if ('var' in node) return Boolean(evalArg(node, data));

  for (const key of Object.keys(node)) {
    const val = node[key];
    if (Array.isArray(val)) {
      return evalNode([opFromKey(key), ...val], data);
    }
    return false;
  }
  return false;
}

function evalArg(arg: any, data: any): any {
  if (arg == null) return arg;
  if (typeof arg !== 'object') return arg;
  if (Array.isArray(arg)) return evalNode(arg, data);
  if ('var' in arg) {
    const path = String(arg.var).split('.');
    let cur: any = data;
    for (const p of path) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return cur;
  }
  return arg;
}

function opFromKey(key: string): string {
  const map: Record<string, string> = {
    eq: '==', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=',
    and: 'and', or: 'or', not: 'not', in: 'in',
  };
  return map[key] || key;
}
