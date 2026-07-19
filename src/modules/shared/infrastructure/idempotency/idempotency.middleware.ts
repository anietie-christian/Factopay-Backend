import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { IdempotencyConflictException } from '../../domain/exceptions/factopay.exception';
import { RedisService } from '../cache/redis.service';

@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  constructor(private readonly redisService: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Only apply to state-mutating requests
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const idempotencyKey = req.headers['idempotency-key'] as string;

      if (!idempotencyKey) {
        return next();
      }

      const key = `idempotency:middleware:${idempotencyKey}`;

      try {
        const lockAcquired = await this.redisService.setNxWithExpiry(key, 'processing', 120);
        if (!lockAcquired) {
          throw new IdempotencyConflictException();
        }

        res.on('finish', async () => {
          if (res.statusCode >= 400) {
            await this.redisService.delete(key).catch(() => {});
          }
        });
      } catch (error) {
        return next(error);
      }
    }

    next();
  }
}
