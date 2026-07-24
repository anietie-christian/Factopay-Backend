// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Test, TestingModule } from '@nestjs/testing';
import { HealthController, RedisHealthIndicator } from '../infrastructure/controllers/health.controller';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: Record<string, any>;

  beforeEach(async () => {
    healthCheckService = {
      check: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckService },
        { provide: PrismaHealthIndicator, useValue: {} },
        { provide: PrismaService, useValue: {} },
        { provide: RedisHealthIndicator, useValue: {} },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  describe('GET /health/live', () => {
    it('should return { status: "ok" }', () => {
      expect(controller.live()).toEqual({ status: 'ok' });
    });
  });

  describe('GET /health/ready', () => {
    it('should call HealthCheckService.check', async () => {
      healthCheckService.check.mockResolvedValue({
        status: 'ok',
        info: { database: { status: 'up' }, redis: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' }, redis: { status: 'up' } },
      });

      const result = await controller.ready();

      expect(result.status).toBe('ok');
      expect(healthCheckService.check).toHaveBeenCalled();
    });
  });
});
