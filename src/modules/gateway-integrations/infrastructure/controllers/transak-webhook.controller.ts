import { Controller, Post, Body, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RecordWebhookEventUseCase } from '../../application/use-cases/record-webhook-event.use-case';

@Controller('webhooks/transak')
export class TransakWebhookController {
  private readonly logger = new Logger(TransakWebhookController.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly recordWebhookUseCase: RecordWebhookEventUseCase,
  ) {}

  @Post()
  async handleTransakWebhook(@Body() body: any) {
    const eventId = body?.webhookData?.id ? String(body.webhookData.id) : String(body?.eventID || 'unknown');
    this.logger.log(`Received Transak Webhook: ${eventId}`);

    // Record webhook event
    const { isDuplicate } = await this.recordWebhookUseCase.execute({
      provider: 'TRANSAK',
      eventId,
      eventType: body?.eventID,
      metadata: body,
    });

    if (isDuplicate) {
      this.logger.warn(`Duplicate Transak webhook skipped: ${eventId}`);
      return { received: true, duplicate: true };
    }

    try {
      // Emit internal event for processing (e.g. KYC update, Crypto deposit)
      this.eventEmitter.emit(`transak.${body?.eventID}`, body);
      
      await this.recordWebhookUseCase.updateStatus('TRANSAK', eventId, 'PROCESSED');
    } catch (error) {
      await this.recordWebhookUseCase.updateStatus('TRANSAK', eventId, 'FAILED');
      throw error;
    }
    
    return { received: true };
  }
}
