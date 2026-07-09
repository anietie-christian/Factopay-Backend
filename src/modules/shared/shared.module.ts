import { Global, Module } from '@nestjs/common';
import { PrismaService } from './infrastructure/database/prisma.service';
import { RedisService } from './infrastructure/cache/redis.service';

@Global()
@Module({
  providers: [PrismaService, RedisService],
  exports: [PrismaService, RedisService],
})
export class SharedModule { }