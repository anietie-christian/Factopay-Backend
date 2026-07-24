// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SmsTransportAdapter {
  private readonly logger = new Logger(SmsTransportAdapter.name);

  async sendSms(to: string, message: string): Promise<void> {
    this.logger.log(`[Twilio SMS Sent] To: ${to}`);
    this.logger.debug(`Message: ${message}`);
    // In production:
    // import * as twilio from 'twilio';
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // await client.messages.create({ body: message, from: process.env.TWILIO_PHONE_NUMBER, to });
  }
}
