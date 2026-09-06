import { Request, Response, NextFunction } from 'express';
import { Buffer } from 'buffer';

// Store raw body on request
export const rawBodyMiddleware = (req: Request, res: Response, next: NextFunction) => {
  let data: Buffer[] = [];
  req.on('data', (chunk) => {
    data.push(chunk);
  });
  req.on('end', () => {
    req.rawBody = Buffer.concat(data).toString();
    next();
  });
  req.on('error', (err) => {
    next(err);
  });
};

declare global {
  namespace Express {
    interface Request {
      rawBody?: string;
    }
  }
}
