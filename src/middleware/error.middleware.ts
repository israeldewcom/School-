// src/middleware/error.middleware.ts
import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

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

function normalizeError(err: any): { status: number; message: string; details?: any[] } {
  if (err instanceof AppError) {
    return { status: err.statusCode, message: err.message };
  }

  if (err?.name === 'CastError') {
    const field = err.path || 'field';
    const value = err.value === '' ? '(empty string)' : JSON.stringify(err.value);
    return {
      status: 400,
      message: `Invalid value for "${field}": ${value}. Please provide a valid id.`,
    };
  }

  if (err?.name === 'ValidationError') {
    const details = Object.values(err.errors || {}).map((e: any) => ({
      path: e.path ? [e.path] : undefined,
      message: e.message,
    }));
    const first = details[0]?.message || 'Validation failed';
    return { status: 400, message: first, details };
  }

  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return {
      status: 409,
      message: `A record with that ${field} already exists.`,
    };
  }

  if (err?.name === 'JsonWebTokenError') {
    return { status: 401, message: 'Invalid authentication token.' };
  }
  if (err?.name === 'TokenExpiredError') {
    return { status: 401, message: 'Session expired. Please log in again.' };
  }

  if (err?.type === 'entity.parse.failed') {
    return { status: 400, message: 'Malformed JSON in request body.' };
  }
  if (err?.type === 'entity.too.large') {
    return { status: 413, message: 'Request body is too large.' };
  }

  return { status: 500, message: 'Something went wrong on our end. Please try again.' };
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const { status, message, details } = normalizeError(err);

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

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}
