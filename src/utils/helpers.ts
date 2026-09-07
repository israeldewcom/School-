export const formatCurrency = (amount: number, currency: string = 'NGN'): string => {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency }).format(amount / 100);
};

export const generateRandomString = (length: number = 8): string => {
  return Math.random().toString(36).substring(2, 2 + length);
};

export const sanitizePhoneNumber = (phone: string): string => {
  return phone.replace(/\s/g, '').replace(/^0/, '234');
};

export const isValidEmail = (email: string): boolean => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

export const getPagination = (page: number = 1, limit: number = 10) => {
  const skip = (page - 1) * limit;
  return { skip, limit };
};

export const toKobo = (naira: number): number => {
  return Math.round(naira * 100);
};

export const toNaira = (kobo: number): number => {
  return kobo / 100;
};
