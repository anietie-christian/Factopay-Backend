import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IEmailGateway } from '../../domain/gateways/email-gateway.interface';
import sgMail = require('@sendgrid/mail');

@Injectable()
export class SendgridAdapter implements IEmailGateway {
  private readonly logger = new Logger(SendgridAdapter.name);
  private readonly fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
    this.fromEmail = this.configService.get<string>('SENDGRID_FROM_EMAIL');

    if (!apiKey || !this.fromEmail) {
      throw new Error(
        'SendGrid configuration is missing. Ensure SENDGRID_API_KEY and SENDGRID_FROM_EMAIL are set.',
      );
    }

    sgMail.setApiKey(apiKey);
  }

  async sendEmail(to: string, subject: string, body: string): Promise<boolean> {
    try {
      this.logger.log(`Sending Email to ${to}...`);
      await sgMail.send({
        to,
        from: this.fromEmail,
        subject,
        text: body, // we can use 'html' property as well in the future
      });
      this.logger.log(`Email successfully sent to ${to}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send Email to ${to}:`, error);
      throw error;
    }
  }
}
