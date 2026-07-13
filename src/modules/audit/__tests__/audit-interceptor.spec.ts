import { AuditInterceptor } from '../infrastructure/interceptors/audit.interceptor';
import { AuditLoggerService } from '../application/services/audit-logger.service';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';

describe('AuditInterceptor (Fallback behavior)', () => {
  let interceptor: AuditInterceptor;
  let auditLogger: jest.Mocked<AuditLoggerService>;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    auditLogger = {
      logAction: jest.fn(),
    } as any;

    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(null), // No decorator present
    } as any;

    interceptor = new AuditInterceptor(reflector, auditLogger);
  });

  it('should fallback to [METHOD] /path when @AuditLog is not present', (done) => {
    const mockRequest = {
      method: 'PATCH',
      url: '/api/v1/some-undecorated-endpoint',
      user: { id: 'user-123' },
      ip: '127.0.0.1',
      body: { data: 'test' },
    };

    const context = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as unknown as ExecutionContext;

    const next = {
      handle: () => of({ id: 'res-456' }), // mock successful response
    } as CallHandler;

    interceptor.intercept(context, next).subscribe({
      next: () => {
        expect(auditLogger.logAction).toHaveBeenCalledWith(
          expect.objectContaining({
            action: '[PATCH] /api/v1/some-undecorated-endpoint', // The fallback action!
            targetType: 'ENDPOINT',
            targetId: 'res-456',
            userId: 'user-123',
          })
        );
        done();
      },
    });
  });
});
