import { Injectable, NestMiddleware, UnauthorizedException, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class TransakSignatureMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TransakSignatureMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    const signature = req.headers['x-transak-signature'] as string;
    if (!signature) {
      throw new UnauthorizedException('Missing Transak signature');
    }

    const payload = JSON.stringify(req.body);
    const secret = process.env.TRANSAK_WEBHOOK_SECRET || 'transak_test_secret';
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    if (computedSignature !== signature) {
      this.logger.warn(`Invalid Transak signature. Expected ${computedSignature}, got ${signature}`);
      throw new UnauthorizedException('Invalid Transak signature');
    }

    next();
  }
}
