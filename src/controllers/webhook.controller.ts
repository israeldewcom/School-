import { Request, Response } from 'express';
import { PaymentService } from '../core/payments/payment.service';
import { verifyPaystackSignature } from '../integrations/paystack/webhook';
import logger from '../config/logger';

export class WebhookController {
  static async paystack(req: Request, res: Response): Promise<void> {
    try {
      const signature = req.headers['x-paystack-signature'] as string;
      const body = req.rawBody; // raw body set by rawBodyMiddleware
      if (!body) {
        res.status(400).send('Missing body');
        return;
      }
      if (!signature) {
        res.status(400).send('Missing signature');
        return;
      }

      if (!verifyPaystackSignature(body, signature)) {
        res.status(401).send('Invalid signature');
        return;
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
