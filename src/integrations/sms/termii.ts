import axios from 'axios';
import { env } from '../../config/env';
import { School } from '../../models/School';
import logger from '../../config/logger';
import { normalizePhone } from '../../utils/phone';

/** Credits used by one message: 1 per 160 characters, minimum 1. */
export const creditsFor = (message: string): number => Math.max(1, Math.ceil((message || '').length / 160));

export const sendSMS = async (schoolId: string, to: string, message: string, senderId?: string): Promise<void> => {
  if (!env.SMS_API_KEY) {
    throw new Error('SMS_API_KEY not set');
  }

  const cost = creditsFor(message);

  // RESERVE credits atomically BEFORE sending, so simultaneous sends cannot overspend.
  const reserved: any = await School.findOneAndUpdate(
    { _id: schoolId, smsBalance: { $gte: cost } },
    { $inc: { smsBalance: -cost, smsMonthlyUsage: cost } },
    { new: true }
  );
  if (!reserved) {
    throw new Error('Insufficient SMS credits. Please top up.');
  }

  try {
    await axios.post('https://api.termii.com/api/sms/send', {
      to: normalizePhone(to) || to,
      from: senderId || env.SMS_SENDER_ID,
      sms: message,
      type: 'plain',
      channel: 'generic',
      api_key: env.SMS_API_KEY,
    });
    logger.info(`SMS sent to ${to}, remaining balance: ${reserved.smsBalance}`);
  } catch (error) {
    // Provider failed -> give the credits back.
    await School.updateOne({ _id: schoolId }, { $inc: { smsBalance: cost, smsMonthlyUsage: -cost } }).catch(() => {});
    logger.error('SMS sending failed:', error);
    throw new Error('Failed to send SMS');
  }
};
