  import crypto from 'crypto';
import { env } from '../../config/env';

export const verifyPaystackSignature = (body: string, signature: string): boolean => {
  if (!body || !signature) return false;

  const expected = crypto
    .createHmac('sha512', env.PAYSTACK_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  if (a.length !== b.length) return false;

  // Constant-time comparison prevents timing attacks on the signature.
  return crypto.timingSafeEqual(a, b);
};
