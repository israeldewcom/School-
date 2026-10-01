// src/utils/phone.ts

/**
 * Normalise a Nigerian (or already-international) phone number to the
 * digits-only international form Termii expects, e.g. 08031234567 ->
 * 2348031234567. Returns '' when the input has no usable digits.
 */
export function normalizePhone(raw: any, defaultCountry = '234'): string {
  let d = String(raw ?? '').replace(/[^\d+]/g, '');
  if (!d) return '';
  if (d.startsWith('+')) return d.slice(1).replace(/\D/g, '');
  d = d.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith(defaultCountry) && d.length >= 12) return d;
  if (d.startsWith('0')) return defaultCountry + d.slice(1);
  if (d.length === 10) return defaultCountry + d;
  return d;
}

/** Last 10 digits — used to match the same number typed in different formats. */
export function phoneKey(raw: any): string {
  const d = String(raw ?? '').replace(/\D/g, '');
  return d.slice(-10);
}

export function naira(kobo: number): string {
  return `₦${((kobo || 0) / 100).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
