import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { RecordWebhookEventUseCase } from '../../application/use-cases/record-webhook-event.use-case';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    @InjectQueue('webhook-dlq') private readonly webhookQueue: Queue,
    private readonly recordWebhookUseCase: RecordWebhookEventUseCase,
  ) {}

  @Post('flutterwave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive Flutterwave payment webhooks' })
  async handleFlutterwaveWebhook(@Body() payload: any) {
    this.logger.log(`Received Flutterwave webhook event: ${payload?.event}`);

    const eventId = payload?.data?.id ? String(payload.data.id) : String(payload?.id || 'unknown');
    
    // Check and record webhook event to prevent duplicates
    const { isDuplicate } = await this.recordWebhookUseCase.execute({
      provider: 'FLUTTERWAVE',
      eventId,
      eventType: payload?.event,
      metadata: payload,
    });

    if (isDuplicate) {
      this.logger.warn(`Duplicate Flutterwave webhook event skipped: ${eventId}`);
      return { success: true, duplicate: true };
    }

    // Push the payload to the queue for background processing and resilient retry
    await this.webhookQueue.add(
      'process_flutterwave',
      payload,
      {
        attempts: 5,
        backoff: {
          type: 'webhookBackoffStrategy',
        },
      }
    );

    this.logger.log(`Webhook queued for processing (Event: ${payload?.event}, ID: ${eventId})`);

    return { success: true };
  }
}
