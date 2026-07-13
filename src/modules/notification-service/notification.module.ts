import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TwilioAdapter } from './infrastructure/adapters/twilio.adapter';
import { SendgridAdapter } from './infrastructure/adapters/sendgrid.adapter';
import { TransferEventListener } from './application/listeners/transfer-event.listener';
import { SMS_GATEWAY_TOKEN } from './domain/gateways/sms-gateway.interface';
import { EMAIL_GATEWAY_TOKEN } from './domain/gateways/email-gateway.interface';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: SMS_GATEWAY_TOKEN,
      useClass: TwilioAdapter,
    },
    {
      provide: EMAIL_GATEWAY_TOKEN,
      useClass: SendgridAdapter,
    },
    TransferEventListener,
  ],
  exports: [SMS_GATEWAY_TOKEN, EMAIL_GATEWAY_TOKEN],
})
export class NotificationModule {}
