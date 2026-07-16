import { Injectable, NestMiddleware, UnauthorizedException, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { getRequiredEnv } from '../../../../config/required-env';

@Injectable()
export class TransakSignatureMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TransakSignatureMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    const signature = req.headers['x-transak-signature'] as string;
    if (!signature) {
      throw new UnauthorizedException('Missing Transak signature');
    }

    const payload = (req as any).rawBody;
    if (!payload) {
      throw new UnauthorizedException('Raw request body is required for Transak signature verification');
    }

    const secret = getRequiredEnv('TRANSAK_WEBHOOK_SECRET');
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const signatureBuffer = Buffer.from(signature, 'hex');
    const computedBuffer = Buffer.from(computedSignature, 'hex');

    if (
      signatureBuffer.length !== computedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, computedBuffer)
    ) {
      this.logger.warn('Invalid Transak signature');
      throw new UnauthorizedException('Invalid Transak signature');
    }

    next();
  }
}
