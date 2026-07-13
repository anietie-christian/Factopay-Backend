import { Controller, Post, Body, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Controller('webhooks/transak')
export class TransakWebhookController {
  private readonly logger = new Logger(TransakWebhookController.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  @Post()
  async handleTransakWebhook(@Body() body: any) {
    this.logger.log(`Received Transak Webhook: ${body.eventID}`);
    // Emit internal event for processing (e.g. KYC update, Crypto deposit)
    this.eventEmitter.emit(`transak.${body.eventID}`, body);
    
    return { received: true };
  }
}
