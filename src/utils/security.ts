import crypto from 'crypto';

export const generateSecureToken = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

export const hashData = (data: string, algorithm: string = 'sha256'): string => {
  return crypto.createHash(algorithm).update(data).digest('hex');
};

export const compareHashes = (data: string, hash: string, algorithm: string = 'sha256'): boolean => {
  return hashData(data, algorithm) === hash;
};

export const sanitizeInput = (input: any): any => {
  if (typeof input === 'string') {
    return input.replace(/[^a-zA-Z0-9 ]/g, '');
  }
  return input;
};

export const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  const maskedLocal = local.slice(0, 2) + '*'.repeat(local.length - 2);
  return `${maskedLocal}@${domain}`;
};

export const maskPhone = (phone: string): string => {
  return phone.slice(0, 4) + '*'.repeat(phone.length - 4);
};
