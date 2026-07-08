import { Module, Global } from '@nestjs/common';
import { PrismaService } from './infrastructure/database/prisma.service';
import { EmailTransportAdapter } from './infrastructure/notifications/email-transport.adapter';
import { SmsTransportAdapter } from './infrastructure/notifications/sms-transport.adapter';
import { RedisService } from './infrastructure/cache/redis.service';

@Global()
@Module({
  providers: [PrismaService, EmailTransportAdapter, SmsTransportAdapter, RedisService],
  exports: [PrismaService, EmailTransportAdapter, SmsTransportAdapter, RedisService],
})
export class SharedModule {}
