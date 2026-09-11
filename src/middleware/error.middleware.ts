import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import logger from '../config/logger';
import * as Sentry from '@sentry/node';

export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) => {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let details = undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else {
    logger.error('Unhandled error:', err);
  }

  if (statusCode >= 500) {
    logger.error(err);
    // Sentry is only initialized when SENTRY_DSN is set (see app.ts); when
    // it isn't, Sentry.captureException still exists on the imported
    // namespace (unlike the old `import Sentry from '@sentry/node'` default
    // import, which was undefined and crashed this whole handler — meaning
    // Express never sent a response and the client just hung forever).
    // Calling it when uninitialized is a safe no-op.
    try {
      Sentry.captureException(err);
    } catch (_) {
      // Never let error reporting itself take down the error handler.
    }
  } else {
    logger.warn(err.message);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(details && { details }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
