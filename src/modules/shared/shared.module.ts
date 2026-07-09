import { Global, Module } from '@nestjs/common';
import { PrismaService } from './infrastructure/database/prisma.service';
import { RedisService } from './infrastructure/cache/redis.service';
import { RolesGuard } from './infrastructure/guards/roles.guard';
import { AdminAuditService } from './infrastructure/services/admin-audit.service';

@Global()
@Module({
  providers: [PrismaService, RedisService, RolesGuard, AdminAuditService],
  exports: [PrismaService, RedisService, RolesGuard, AdminAuditService],
})
export class SharedModule { }