import { Request, Response, NextFunction } from 'express';
import { getIdempotency, setIdempotency } from '../config/redis';
import { BadRequestError } from '../utils/errors';

export const idempotencyMiddleware = (keyPrefix: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const idempotencyKey = req.headers['idempotency-key'] as string;
    if (!idempotencyKey) {
      return next(new BadRequestError('Idempotency key required'));
    }

    const cacheKey = `${keyPrefix}:${idempotencyKey}`;
    const cached = await getIdempotency(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached, idempotent: true });
    }

    // Store the result after the request is done
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      if (body && body.success) {
        setIdempotency(cacheKey, body.data).catch(() => {});
      }
      return originalJson(body);
    };

    next();
  };
};
