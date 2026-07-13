import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import axios from 'axios';

export interface WebhookPayload {
  eventId: string;
  eventType: string;
  data: any;
  timestamp: string;
}

@Injectable()
export class OutboundWebhookService {
  private readonly logger = new Logger(OutboundWebhookService.name);

  async sendWebhook(url: string, secret: string, payload: WebhookPayload): Promise<boolean> {
    try {
      const payloadString = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', secret)
        .update(payloadString)
        .digest('hex');

      await axios.post(url, payloadString, {
        headers: {
          'Content-Type': 'application/json',
          'x-factopay-signature': signature,
        },
        timeout: 5000,
      });

      this.logger.log(`Successfully delivered outbound webhook to ${url}`);
      return true;
    } catch (e: any) {
      this.logger.error(`Failed to deliver outbound webhook to ${url}: ${e.message}`);
      return false;
    }
  }
}
