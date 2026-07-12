import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class WebhookSignatureMiddleware implements NestMiddleware {
  // In production, this would be loaded via ConfigService from environment variables
  private readonly WEBHOOK_SECRET = 'dummy_webhook_secret_for_mvp';

  use(req: Request, res: Response, next: NextFunction) {
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
      .createHmac('sha256', this.WEBHOOK_SECRET)
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
