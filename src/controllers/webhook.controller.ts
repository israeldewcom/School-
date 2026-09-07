import { Request, Response, NextFunction } from 'express';
import { PaymentService } from '../services/payment.service';
import { verifyPaystackSignature } from '../integrations/paystack/webhook';
import logger from '../config/logger';

export class WebhookController {
  static async paystack(req: Request, res: Response, next: NextFunction) {
    try {
      const signature = req.headers['x-paystack-signature'] as string;
      const body = req.rawBody; // raw body set by rawBodyMiddleware
      if (!body) {
        return res.status(400).send('Missing body');
      }
      if (!signature) {
        return res.status(400).send('Missing signature');
      }

      if (!verifyPaystackSignature(body, signature)) {
        return res.status(401).send('Invalid signature');
      }

      const payload = JSON.parse(body);
      await PaymentService.processPaystackWebhook(payload);
      res.sendStatus(200);
    } catch (error) {
      logger.error('Paystack webhook error:', error);
      res.sendStatus(500);
    }
  }
}
