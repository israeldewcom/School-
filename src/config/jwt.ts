// src/config/jwt.ts
import crypto from 'crypto';
import logger from './logger';

const DEV_FALLBACK = 'dev-only-insecure-secret-never-use-in-production';
let warned = false;

function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

function firstDefined(...values: Array<string | undefined>): string | undefined {
  for (const v of values) {
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * Access-token secret. Reads JWT_ACCESS_SECRET (as documented in
 * .env.example) and falls back to the legacy JWT_SECRET. In production
 * a missing secret is a hard failure; there is no hardcoded fallback.
 */
export function getAccessSecret(): string {
  const secret = firstDefined(process.env.JWT_ACCESS_SECRET, process.env.JWT_SECRET);
  if (secret) return secret;

  if (isProd()) {
    throw new Error(
      'JWT_ACCESS_SECRET is not set. Refusing to sign or verify tokens in production.'
    );
  }
  if (!warned) {
    warned = true;
    logger.warn('JWT_ACCESS_SECRET is not set. Using an insecure development secret.');
  }
  return DEV_FALLBACK;
}

/**
 * Refresh-token secret. Uses JWT_REFRESH_SECRET when provided. Otherwise
 * it is derived from the access secret so the two are never identical,
 * which stops a refresh token from being accepted as an access token.
 */
export function getRefreshSecret(): string {
  const explicit = firstDefined(process.env.JWT_REFRESH_SECRET);
  if (explicit) return explicit;

  return crypto
    .createHmac('sha256', getAccessSecret())
    .update('schoolflow-refresh-token-secret')
    .digest('hex');
}

export function assertJwtConfig(): void {
  getAccessSecret();
  getRefreshSecret();
}

// Fail fast at startup in production.
if (isProd()) {
  assertJwtConfig();
}
