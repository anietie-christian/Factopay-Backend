// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './infrastructure/database/prisma.service';
import { RedisService } from './infrastructure/cache/redis.service';
import { RolesGuard } from './infrastructure/guards/roles.guard';
import { AdminAuditService } from './infrastructure/services/admin-audit.service';
import { HealthController, RedisHealthIndicator } from './infrastructure/controllers/health.controller';
import { TerminusModule } from '@nestjs/terminus';

@Global()
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [PrismaService, RedisService, RolesGuard, AdminAuditService, RedisHealthIndicator],
  exports: [PrismaService, RedisService, RolesGuard, AdminAuditService],
})
export class SharedModule { }