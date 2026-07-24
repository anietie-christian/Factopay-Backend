// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Test, TestingModule } from '@nestjs/testing';
import { AuditLoggerService } from '../application/services/audit-logger.service';
import { AuditInterceptor } from '../infrastructure/interceptors/audit.interceptor';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { Reflector } from '@nestjs/core';
import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { AuditLog } from '../domain/decorators/audit-log.decorator';
import { of } from 'rxjs';

// A mock controller to test the interceptor
@Controller('test-audit')
class TestAuditController {
  @Get('create')
  @AuditLog({ action: 'MOCK_CREATE', targetType: 'MOCK' })
  @UseInterceptors(AuditInterceptor)
  create() {
    return { id: 'mock-123', status: 'created' };
  }
}

describe('Audit Module', () => {
  let auditLogger: AuditLoggerService;
  let interceptor: AuditInterceptor;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLoggerService,
        AuditInterceptor,
        Reflector,
        {
          provide: PrismaService,
          useValue: {
            auditLog: {
              create: jest.fn().mockResolvedValue({ id: 'log-1' }),
            },
          },
        },
      ],
    }).compile();

    auditLogger = module.get<AuditLoggerService>(AuditLoggerService);
    interceptor = module.get<AuditInterceptor>(AuditInterceptor);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('AuditLoggerService', () => {
    it('should log an action successfully', async () => {
      const spy = jest.spyOn(prisma.auditLog, 'create');
      await auditLogger.logAction({
        userId: 'user-1',
        action: 'TEST_ACTION',
        targetType: 'TEST',
        targetId: 'target-1',
        metadata: { info: 'test' },
        ipAddress: '127.0.0.1',
      });

      expect(spy).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          action: 'TEST_ACTION',
          targetType: 'TEST',
          targetId: 'target-1',
          metadata: { info: 'test' },
          ipAddress: '127.0.0.1',
        },
      });
    });
  });

  describe('AuditInterceptor', () => {
    it('should intercept and log an action via decorator', (done) => {
      const mockExecutionContext = {
        getHandler: jest.fn().mockReturnValue(TestAuditController.prototype.create),
        getClass: jest.fn().mockReturnValue(TestAuditController),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: { sub: 'user-2' },
            ip: '192.168.1.1',
            body: {},
            params: {},
            query: {},
          }),
        }),
      } as any;

      const mockCallHandler = {
        handle: jest.fn().mockReturnValue(of({ id: 'mock-123' })),
      };

      const spy = jest.spyOn(auditLogger, 'logAction');

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        next: () => {
          expect(spy).toHaveBeenCalledWith({
            userId: 'user-2',
            action: 'MOCK_CREATE',
            targetType: 'MOCK',
            targetId: 'mock-123',
            ipAddress: '192.168.1.1',
            metadata: {
              request: {
                body: {},
                params: {},
                query: {},
              },
            },
          });
          done();
        },
      });
    });
  });
});
