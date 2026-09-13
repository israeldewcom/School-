import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import logger from '../config/logger';

// Custom application errors. If you already have these in
// src/utils/errors.ts, keep those and just import them here — the
// class shapes below match what the rest of the codebase expects.
export class AppError extends Error {
  constructor(public message: string, public statusCode: number = 500, public code?: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }
}
export class BadRequestError extends AppError {
  constructor(message: string, code?: string) { super(message, 400, code); }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') { super(message, 401); }
}
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') { super(message, 403); }
}
export class NotFoundError extends AppError {
  constructor(message = 'Not found') { super(message, 404); }
}
export class ConflictError extends AppError {
  constructor(message: string) { super(message, 409); }
}

// Maps Mongoose / Mongo / JWT errors to a proper HTTP status and a
// clean message. This is the single place where "server crashed with
// a 500" gets converted into "your input was wrong, fix it".
function normalizeError(err: any): { status: number; message: string; details?: any[] } {
  if (err instanceof AppError) {
    return { status: err.statusCode, message: err.message };
  }

  // Mongoose cast error (e.g. passing "" or "abc" where an ObjectId
  // is expected). Was showing as 500 before — now 400.
  if (err?.name === 'CastError') {
    const field = err.path || 'field';
    const value = err.value === '' ? '(empty string)' : JSON.stringify(err.value);
    return {
      status: 400,
      message: `Invalid value for "${field}": ${value}. Please provide a valid id.`,
    };
  }

  // Mongoose validation error (required field missing, enum mismatch,
  // min/max violated). Was 500 — now 400 with per-field details.
  if (err?.name === 'ValidationError') {
    const details = Object.values(err.errors || {}).map((e: any) => ({
      path: e.path ? [e.path] : undefined,
      message: e.message,
    }));
    const first = details[0]?.message || 'Validation failed';
    return { status: 400, message: first, details };
  }

  // Duplicate key (unique index violation).
  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return {
      status: 409,
      message: `A record with that ${field} already exists.`,
    };
  }

  // JWT errors.
  if (err?.name === 'JsonWebTokenError') {
    return { status: 401, message: 'Invalid authentication token.' };
  }
  if (err?.name === 'TokenExpiredError') {
    return { status: 401, message: 'Session expired. Please log in again.' };
  }

  // Body-parser / JSON parse errors.
  if (err?.type === 'entity.parse.failed') {
    return { status: 400, message: 'Malformed JSON in request body.' };
  }
  if (err?.type === 'entity.too.large') {
    return { status: 413, message: 'Request body is too large.' };
  }

  // Fallback — genuinely unknown. Log it so ops can investigate, but
  // never leak the raw stack to the client.
  return { status: 500, message: 'Something went wrong on our end. Please try again.' };
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const { status, message, details } = normalizeError(err);

  // Log only 5xx at error level; 4xx is normal client behavior.
  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} → ${status}: ${err.message}`, {
      stack: err.stack,
      body: req.body,
      query: req.query,
      params: req.params,
    });
  } else {
    logger.warn(`${req.method} ${req.originalUrl} → ${status}: ${message}`);
  }

  res.status(status).json({
    success: false,
    message,
    ...(details ? { details } : {}),
  });
}

// 404 catch-all for unmatched routes. Register this AFTER all routers.
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}
