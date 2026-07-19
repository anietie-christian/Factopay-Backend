import { Test, TestingModule } from '@nestjs/testing';
import { IdempotencyMiddleware } from './idempotency.middleware';
import { RedisService } from '../cache/redis.service';
import { IdempotencyConflictException } from '../../domain/exceptions/factopay.exception';
import { Request, Response } from 'express';

describe('IdempotencyMiddleware', () => {
  let middleware: IdempotencyMiddleware;
  let redisService: jest.Mocked<RedisService>;

  beforeEach(async () => {
    const redisServiceMock = {
      setNxWithExpiry: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyMiddleware,
        { provide: RedisService, useValue: redisServiceMock },
      ],
    }).compile();

    middleware = module.get<IdempotencyMiddleware>(IdempotencyMiddleware);
    redisService = module.get(RedisService);
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  it('should pass through if request method is GET', async () => {
    const req = {
      method: 'GET',
      headers: {
        'idempotency-key': 'test-key',
      },
    } as unknown as Request;
    const res = {} as unknown as Response;
    const next = jest.fn();

    await middleware.use(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(redisService.setNxWithExpiry).not.toHaveBeenCalled();
  });

  it('should pass through if idempotency-key header is missing', async () => {
    const req = {
      method: 'POST',
      headers: {},
    } as unknown as Request;
    const res = {} as unknown as Response;
    const next = jest.fn();

    await middleware.use(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(redisService.setNxWithExpiry).not.toHaveBeenCalled();
  });

  it('should throw IdempotencyConflictException if lock cannot be acquired', async () => {
    const req = {
      method: 'POST',
      headers: {
        'idempotency-key': 'conflict-key',
      },
    } as unknown as Request;
    const res = {} as unknown as Response;
    const next = jest.fn();

    redisService.setNxWithExpiry.mockResolvedValue(false);

    await middleware.use(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(IdempotencyConflictException));
    expect(redisService.setNxWithExpiry).toHaveBeenCalledWith(
      'idempotency:middleware:conflict-key',
      'processing',
      120,
    );
  });

  it('should acquire lock and call next if lock is successfully acquired', async () => {
    const req = {
      method: 'POST',
      headers: {
        'idempotency-key': 'success-key',
      },
    } as unknown as Request;
    const res = {
      statusCode: 200,
      on: jest.fn(),
    } as unknown as Response;
    const next = jest.fn();

    redisService.setNxWithExpiry.mockResolvedValue(true);

    await middleware.use(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(redisService.setNxWithExpiry).toHaveBeenCalledWith(
      'idempotency:middleware:success-key',
      'processing',
      120,
    );
    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('should delete lock on finish if status code is >= 400', async () => {
    const req = {
      method: 'POST',
      headers: {
        'idempotency-key': 'error-key',
      },
    } as unknown as Request;
    
    let finishCallback: () => void = () => {};
    const res = {
      statusCode: 500,
      on: jest.fn().mockImplementation((event, cb) => {
        if (event === 'finish') {
          finishCallback = cb;
        }
      }),
    } as unknown as Response;
    const next = jest.fn();

    redisService.setNxWithExpiry.mockResolvedValue(true);

    await middleware.use(req, res, next);
    
    // Trigger finish callback
    await finishCallback();

    expect(redisService.delete).toHaveBeenCalledWith('idempotency:middleware:error-key');
  });
});
