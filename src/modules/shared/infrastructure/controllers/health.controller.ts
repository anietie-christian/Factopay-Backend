import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../cache/redis.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
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
   * Readiness probe — checks DB and Redis connectivity.
   * Returns 503 if any critical dependency is unreachable.
   */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiResponse({ status: 200, description: 'All dependencies are reachable' })
  @ApiResponse({ status: 503, description: 'One or more dependencies are unreachable' })
  async ready() {
    const checks: Record<string, string> = {};
    let healthy = true;

    // Database check
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'up';
    } catch {
      checks.database = 'down';
      healthy = false;
    }

    // Redis check
    try {
      await this.redis.ping();
      checks.redis = 'up';
    } catch {
      checks.redis = 'down';
      healthy = false;
    }

    const status = healthy ? 'ok' : 'error';
    return { status, checks };
  }
}
