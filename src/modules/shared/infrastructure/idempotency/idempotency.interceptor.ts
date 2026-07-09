import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of, throwError, from } from 'rxjs';
import { mergeMap, catchError } from 'rxjs/operators';
import { REQUIRES_IDEMPOTENCY_KEY } from './requires-idempotency.decorator';
import { RedisService } from '../cache/redis.service';
import { Request } from 'express';

const IDEMPOTENCY_TTL_SECONDS = 120;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const requiresIdempotency = this.reflector.getAllAndOverride<boolean>(
      REQUIRES_IDEMPOTENCY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiresIdempotency) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const idempotencyKey = request.headers['idempotency-key'];

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw new BadRequestException('Idempotency-Key header is required for this operation');
    }

    const responseKey = `idempotency:response:${idempotencyKey}`;
    const lockKey = `idempotency:lock:${idempotencyKey}`;

    // 1. Check if we already have a cached response
    const cachedResponse = await this.redisService.get(responseKey);
    if (cachedResponse) {
      this.logger.log(`Idempotency hit! Returning cached response for key: ${idempotencyKey}`);
      try {
        return of(JSON.parse(cachedResponse));
      } catch (err) {
        return of(cachedResponse);
      }
    }

    // 2. Try to acquire the processing lock
    const lockAcquired = await this.redisService.setNxWithExpiry(lockKey, 'processing', IDEMPOTENCY_TTL_SECONDS);
    if (!lockAcquired) {
      this.logger.warn(`Idempotency conflict! Request already processing for key: ${idempotencyKey}`);
      throw new ConflictException('A request with this Idempotency-Key is currently being processed');
    }

    // 3. Proceed with the request and cache the result
    return next.handle().pipe(
      mergeMap(async (responseBody) => {
        // Cache the successful response
        await this.redisService.setWithExpiry(
          responseKey,
          JSON.stringify(responseBody),
          IDEMPOTENCY_TTL_SECONDS,
        );
        // Release the processing lock
        await this.redisService.delete(lockKey);
        return responseBody;
      }),
      catchError((err) => {
        // If an error occurs, release the lock so the client can retry
        return from(
          this.redisService.delete(lockKey)
            .catch((deleteErr) => {
              this.logger.error(`Failed to delete idempotency lock for key: ${idempotencyKey}`, deleteErr);
            })
            .then(() => {
              throw err;
            })
        );
      }),
    );
  }
}
