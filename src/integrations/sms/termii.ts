import axios from 'axios';
import { env } from '../../config/env';
import { School } from '../../models/School';
import logger from '../../config/logger';

export const sendSMS = async (schoolId: string, to: string, message: string, senderId?: string): Promise<void> => {
  if (!env.SMS_API_KEY) {
    throw new Error('SMS_API_KEY not set');
  }

  // Check school balance
  const school = await School.findById(schoolId);
  if (!school) throw new Error('School not found');
  if (school.smsBalance < 1) {
    throw new Error('Insufficient SMS credits. Please top up.');
  }

  // Send SMS via Termii
  try {
    await axios.post('https://api.termii.com/api/sms/send', {
      to,
      from: senderId || env.SMS_SENDER_ID,
      sms: message,
      type: 'plain',
      channel: 'generic',
      api_key: env.SMS_API_KEY,
    });
    // Deduct 1 credit (or actual cost)
    school.smsBalance -= 1;
    school.smsMonthlyUsage += 1;
    await school.save();
    logger.info(`SMS sent to ${to}, remaining balance: ${school.smsBalance}`);
  } catch (error) {
    logger.error('SMS sending failed:', error);
    throw new Error('Failed to send SMS');
  }
};
