// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Controller, Get, Injectable } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../cache/redis.service';
import { HealthCheckService, PrismaHealthIndicator, HealthIndicator, HealthIndicatorResult, HealthCheckError, HealthCheck } from '@nestjs/terminus';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly redisService: RedisService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.redisService.ping();
      return this.getStatus(key, true);
    } catch (e) {
      throw new HealthCheckError('Redis check failed', this.getStatus(key, false, { message: e.message }));
    }
  }
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prismaHealth: PrismaHealthIndicator,
    private prisma: PrismaService,
    private redisIndicator: RedisHealthIndicator,
  ) {}

  /**
   * Liveness probe — if the process responds, it's alive.
   * No dependency checks; just confirms the event loop is running.
   */
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'Application is alive' })
  live() {
    return { status: 'ok' };
  }

  /**
   * Readiness probe — checks DB and Redis connectivity using Terminus.
   * Returns 503 if any critical dependency is unreachable.
   */
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiResponse({ status: 200, description: 'All dependencies are reachable' })
  @ApiResponse({ status: 503, description: 'One or more dependencies are unreachable' })
  ready() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
      () => this.redisIndicator.isHealthy('redis'),
    ]);
  }
}
