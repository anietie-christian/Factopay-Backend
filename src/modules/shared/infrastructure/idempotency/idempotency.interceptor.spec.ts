import { ExecutionContext, CallHandler, BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { RedisService } from '../cache/redis.service';
import { REQUIRES_IDEMPOTENCY_KEY } from './requires-idempotency.decorator';
import { of, throwError } from 'rxjs';
import { lastValueFrom } from 'rxjs';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let redisService: jest.Mocked<RedisService>;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(async () => {
    const redisServiceMock = {
      get: jest.fn(),
      setNxWithExpiry: jest.fn(),
      setWithExpiry: jest.fn(),
      delete: jest.fn().mockResolvedValue(true),
    };

    const reflectorMock = {
      getAllAndOverride: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyInterceptor,
        { provide: RedisService, useValue: redisServiceMock },
        { provide: Reflector, useValue: reflectorMock },
      ],
    }).compile();

    interceptor = module.get<IdempotencyInterceptor>(IdempotencyInterceptor);
    redisService = module.get(RedisService);
    reflector = module.get(Reflector);
  });

  it('should pass through if route does not require idempotency', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const mockCallHandler = { handle: jest.fn().mockReturnValue(of('success')) };
    const mockExecutionContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    const result = await interceptor.intercept(mockExecutionContext, mockCallHandler);
    await lastValueFrom(result);

    expect(mockCallHandler.handle).toHaveBeenCalled();
    expect(redisService.get).not.toHaveBeenCalled();
  });

  describe('when route requires idempotency', () => {
    let mockExecutionContext: any;
    let mockCallHandler: any;

    beforeEach(() => {
      reflector.getAllAndOverride.mockReturnValue(true);
      mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: {
              'idempotency-key': 'test-key-123',
            },
          }),
        }),
        getHandler: jest.fn(),
        getClass: jest.fn(),
      };
      mockCallHandler = { handle: jest.fn().mockReturnValue(of({ data: 'new-response' })) };
    });

    it('should throw BadRequestException if header is missing', async () => {
      mockExecutionContext.switchToHttp.mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ headers: {} }),
      });

      await expect(interceptor.intercept(mockExecutionContext, mockCallHandler)).rejects.toThrow(BadRequestException);
    });

    it('should return cached response if it exists', async () => {
      redisService.get.mockResolvedValue(JSON.stringify({ data: 'cached-response' }));

      const result = await interceptor.intercept(mockExecutionContext, mockCallHandler);
      const resData = await lastValueFrom(result);

      expect(resData).toEqual({ data: 'cached-response' });
      expect(mockCallHandler.handle).not.toHaveBeenCalled();
      expect(redisService.setNxWithExpiry).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if lock cannot be acquired (already processing)', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.setNxWithExpiry.mockResolvedValue(false);

      await expect(interceptor.intercept(mockExecutionContext, mockCallHandler)).rejects.toThrow(ConflictException);
    });

    it('should process request, cache response, and release lock on success', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.setNxWithExpiry.mockResolvedValue(true);

      const result = await interceptor.intercept(mockExecutionContext, mockCallHandler);
      const resData = await lastValueFrom(result);

      expect(resData).toEqual({ data: 'new-response' });
      expect(redisService.setWithExpiry).toHaveBeenCalledWith(
        'idempotency:response:test-key-123',
        JSON.stringify({ data: 'new-response' }),
        120,
      );
      expect(redisService.delete).toHaveBeenCalledWith('idempotency:lock:test-key-123');
    });

    it('should release lock if the handler throws an error', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.setNxWithExpiry.mockResolvedValue(true);
      mockCallHandler.handle.mockReturnValue(throwError(() => new Error('Business Error')));

      const result = await interceptor.intercept(mockExecutionContext, mockCallHandler);
      
      await expect(lastValueFrom(result)).rejects.toThrow('Business Error');
      
      expect(redisService.setWithExpiry).not.toHaveBeenCalled();
      expect(redisService.delete).toHaveBeenCalledWith('idempotency:lock:test-key-123');
    });
  });
});
