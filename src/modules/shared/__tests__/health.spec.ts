import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../infrastructure/controllers/health.controller';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { RedisService } from '../infrastructure/cache/redis.service';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: Record<string, any>;
  let redis: Record<string, any>;

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    redis = { ping: jest.fn().mockResolvedValue('PONG') };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
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
    it('should return ok when all dependencies are up', async () => {
      const result = await controller.ready();

      expect(result.status).toBe('ok');
      expect(result.checks.database).toBe('up');
      expect(result.checks.redis).toBe('up');
    });

    it('should return error when the database is down', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));

      const result = await controller.ready();

      expect(result.status).toBe('error');
      expect(result.checks.database).toBe('down');
      expect(result.checks.redis).toBe('up');
    });

    it('should return error when Redis is down', async () => {
      redis.ping.mockRejectedValue(new Error('Redis not initialized'));

      const result = await controller.ready();

      expect(result.status).toBe('error');
      expect(result.checks.database).toBe('up');
      expect(result.checks.redis).toBe('down');
    });

    it('should return error when both dependencies are down', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('db down'));
      redis.ping.mockRejectedValue(new Error('redis down'));

      const result = await controller.ready();

      expect(result.status).toBe('error');
      expect(result.checks.database).toBe('down');
      expect(result.checks.redis).toBe('down');
    });
  });
});
