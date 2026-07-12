import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class WebhookSignatureMiddleware implements NestMiddleware {
  constructor() {
    if (!process.env.PAYMENT_WEBHOOK_SECRET) {
      throw new Error('CRITICAL SECURITY ERROR: PAYMENT_WEBHOOK_SECRET environment variable is missing.');
    }
  }

  use(req: Request, res: Response, next: NextFunction) {
    const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET as string;
    const signature = req.headers['x-webhook-signature'];

    if (!signature || typeof signature !== 'string') {
      throw new UnauthorizedException('Missing or invalid webhook signature header');
    }

    // In a real NestJS app, raw body must be preserved using JSON body parser configuration.
    // Assuming req.rawBody contains the unparsed raw buffer from the webhook request:
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    if (!rawBody) {
      throw new UnauthorizedException('Request body is empty');
    }

    const computedHash = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    // Prevent timing attacks when comparing hashes
    const signatureBuffer = Buffer.from(signature, 'hex');
    const computedBuffer = Buffer.from(computedHash, 'hex');

    if (
      signatureBuffer.length !== computedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, computedBuffer)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    next();
  }
}
