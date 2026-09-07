import crypto from 'crypto';
import { env } from '../../config/env';

export const verifyPaystackSignature = (body: string, signature: string): boolean => {
  const hash = crypto
    .createHmac('sha512', env.PAYSTACK_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');
  return hash === signature;
};
