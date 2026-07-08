import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmailTransportAdapter {
  private readonly logger = new Logger(EmailTransportAdapter.name);

  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    this.logger.log(`[SendGrid Email Sent] To: ${to} | Subject: ${subject}`);
    this.logger.debug(`Body: ${body}`);
    // In production:
    // import * as sgMail from '@sendgrid/mail';
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    // await sgMail.send({ to, from: 'no-reply@factopay.com', subject, text: body });
  }
}
