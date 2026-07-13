import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ISmsGateway } from '../../domain/gateways/sms-gateway.interface';
import { Twilio } from 'twilio';

@Injectable()
export class TwilioAdapter implements ISmsGateway {
  private readonly logger = new Logger(TwilioAdapter.name);
  private client: Twilio;
  private readonly fromNumber: string;

  constructor(private readonly configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.fromNumber = this.configService.get<string>('TWILIO_FROM_NUMBER');

    if (!accountSid || !authToken || !this.fromNumber) {
      throw new Error(
        'Twilio configuration is missing. Ensure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER are set.',
      );
    }

    this.client = new Twilio(accountSid, authToken);
  }

  async sendSms(to: string, message: string): Promise<boolean> {
    try {
      this.logger.log(`Sending SMS to ${to}...`);
      await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to,
      });
      this.logger.log(`SMS successfully sent to ${to}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send SMS to ${to}:`, error);
      throw error;
    }
  }
}
