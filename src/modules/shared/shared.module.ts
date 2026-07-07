import { Module, Global } from '@nestjs/common';
import { PrismaService } from './infrastructure/database/prisma.service';
import { EmailTransportAdapter } from './infrastructure/notifications/email-transport.adapter';
import { SmsTransportAdapter } from './infrastructure/notifications/sms-transport.adapter';

@Global()
@Module({
  providers: [PrismaService, EmailTransportAdapter, SmsTransportAdapter],
  exports: [PrismaService, EmailTransportAdapter, SmsTransportAdapter],
})
export class SharedModule {}
