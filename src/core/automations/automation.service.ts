import { Automation } from '../../models/Automation';
import { Invoice } from '../../models/Invoice';
import { automationQueue } from '../../jobs/queues';
import { NotFoundError } from '../../utils/errors';
import jsonLogic from 'json-logic-js';
import logger from '../../config/logger';

export class AutomationService {
  static async create(data: any) {
    const auto = new Automation(data);
    await auto.save();
    return auto;
  }

  static async getById(id: string, schoolId: string) {
    const auto = await Automation.findOne({ _id: id, schoolId });
    if (!auto) throw new NotFoundError('Automation not found');
    return auto;
  }

  static async getAll(schoolId: string, query: any) {
    return Automation.find({ schoolId, ...query });
  }

  static async update(id: string, schoolId: string, data: any) {
    const auto = await Automation.findOneAndUpdate({ _id: id, schoolId }, data, { new: true });
    if (!auto) throw new NotFoundError('Automation not found');
    return auto;
  }

  static async delete(id: string, schoolId: string) {
    const auto = await Automation.findOneAndDelete({ _id: id, schoolId });
    if (!auto) throw new NotFoundError('Automation not found');
    return auto;
  }

  static async checkOverdueFees() {
    const overdue = await Invoice.find({
      status: { $in: ['ISSUED', 'PARTIALLY_PAID'] },
      dueDate: { $lt: new Date() },
    });
    for (const invoice of overdue) {
      invoice.status = 'OVERDUE';
      await invoice.save();
      await this.triggerAutomation('fee_overdue', {
        invoiceId: invoice._id,
        studentId: invoice.studentId,
        amount: invoice.balance,
        schoolId: invoice.schoolId,
      });
    }
    return overdue.length;
  }

  static async triggerAutomation(event: string, data: any) {
    const automations = await Automation.find({
      event,
      isEnabled: true,
      schoolId: data.schoolId,
    });
    for (const auto of automations) {
      let shouldExecute = true;
      if (auto.condition) {
        try {
          const conditionObj = JSON.parse(auto.condition);
          shouldExecute = jsonLogic.apply(conditionObj, data);
        } catch (e) {
          logger.warn(`Failed to evaluate condition for automation ${auto._id}:`, e);
          shouldExecute = false;
        }
      }
      if (shouldExecute) {
        for (const action of auto.actions) {
          await automationQueue.add('automation-action', {
            automationId: auto._id,
            action,
            data,
          });
        }
        auto.lastRun = new Date();
        await auto.save();
      }
    }
  }
}
