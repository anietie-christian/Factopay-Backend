import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { getRequiredEnv } from '../../../../config/required-env';

@Injectable()
export class WebhookSignatureMiddleware implements NestMiddleware {
  constructor() {
    getRequiredEnv('PAYMENT_WEBHOOK_SECRET');
  }

  use(req: Request, res: Response, next: NextFunction) {
    const WEBHOOK_SECRET = getRequiredEnv('PAYMENT_WEBHOOK_SECRET');
    const signature = req.headers['x-webhook-signature'];

    if (!signature || typeof signature !== 'string') {
      throw new UnauthorizedException('Missing or invalid webhook signature header');
    }

    const rawBody = (req as any).rawBody;

    if (!rawBody) {
      throw new UnauthorizedException('Raw request body is required for webhook signature verification');
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
