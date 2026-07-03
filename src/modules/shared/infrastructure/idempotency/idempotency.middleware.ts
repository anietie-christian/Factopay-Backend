import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { IdempotencyConflictException } from '../../domain/exceptions/factopay.exception';

@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  // TODO: Replace this in-memory store with a Redis client (e.g. using ioredis)
  // for distributed locking in production.
  private readonly idempotencyKeys = new Set<string>();

  use(req: Request, res: Response, next: NextFunction) {
    // Only apply to state-mutating requests
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const idempotencyKey = req.headers['idempotency-key'] as string;

      if (!idempotencyKey) {
        // According to strict financial API rules, we could require the key,
        // but for now we only block if a key is provided and already exists.
        return next();
      }

      if (this.idempotencyKeys.has(idempotencyKey)) {
        throw new IdempotencyConflictException();
      }

      // Lock the key
      this.idempotencyKeys.add(idempotencyKey);

      // Clean up the lock after the request finishes (or keep it based on policy)
      // In a real Redis implementation, this would be set with an expiration (e.g. SET NX EX 86400)
      res.on('finish', () => {
        // Optionally remove the key if the request failed, 
        // or keep it for 24 hours to prevent true duplicate replays.
        // For MVP, we will keep it in memory.
      });
    }

    next();
  }
}
