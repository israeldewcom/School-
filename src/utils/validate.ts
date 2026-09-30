// src/utils/validate.ts
import { BadRequestError } from './errors';

const OBJECT_ID = /^[a-f\d]{24}$/i;

export function isObjectId(value: any): boolean {
  return typeof value === 'string' ? OBJECT_ID.test(value) : OBJECT_ID.test(String(value ?? ''));
}

export function oid(value: any, label: string): string {
  if (value === undefined || value === null || value === '' || !isObjectId(String(value))) {
    throw new BadRequestError(`${label} is invalid`);
  }
  return String(value);
}

export function optOid(value: any, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return oid(value, label);
}

export function text(
  value: any,
  label: string,
  opts: { min?: number; max?: number; required?: boolean } = {}
): string {
  const { min = 1, max = 2000, required = true } = opts;
  const s = value === undefined || value === null ? '' : String(value).trim();
  if (!s) {
    if (required) throw new BadRequestError(`${label} is required`);
    return '';
  }
  if (s.length < min) throw new BadRequestError(`${label} must be at least ${min} characters`);
  if (s.length > max) throw new BadRequestError(`${label} must be at most ${max} characters`);
  return s;
}

export function oneOf<T extends string>(value: any, allowed: readonly T[], label: string): T {
  const v = String(value ?? '').trim().toUpperCase();
  if (!(allowed as readonly string[]).includes(v)) {
    throw new BadRequestError(`${label} must be one of: ${allowed.join(', ')}`);
  }
  return v as T;
}

export function toDate(value: any, label: string): Date {
  const d = new Date(value);
  if (value === undefined || value === null || value === '' || isNaN(d.getTime())) {
    throw new BadRequestError(`${label} is not a valid date`);
  }
  return d;
}

export function optDate(value: any, label: string): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return toDate(value, label);
}

export function isHHmm(value: any): boolean {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function pageParams(query: any, defaultLimit = 50, maxLimit = 200) {
  const page = Math.max(1, parseInt(String(query?.page ?? '1'), 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(String(query?.limit ?? defaultLimit), 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}
