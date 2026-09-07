import axios from 'axios';
import { env } from '../../config/env';

export const sendSMS = async (to: string, message: string, senderId?: string): Promise<void> => {
  if (!env.SMS_API_KEY) {
    throw new Error('SMS_API_KEY not set');
  }
  await axios.post('https://api.termii.com/api/sms/send', {
    to,
    from: senderId || env.SMS_SENDER_ID,
    sms: message,
    type: 'plain',
    channel: 'generic',
    api_key: env.SMS_API_KEY,
  });
};
