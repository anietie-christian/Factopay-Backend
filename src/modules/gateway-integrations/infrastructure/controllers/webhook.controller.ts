import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { RecordWebhookEventUseCase } from '../../application/use-cases/record-webhook-event.use-case';
import { RedisService } from '../../../shared/infrastructure/cache/redis.service';
import { ConflictException } from '@nestjs/common';
@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    @InjectQueue('webhook-dlq') private readonly webhookQueue: Queue,
    private readonly recordWebhookUseCase: RecordWebhookEventUseCase,
    private readonly redisService: RedisService,
  ) {}

  @Post('flutterwave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive Flutterwave payment webhooks' })
  async handleFlutterwaveWebhook(@Body() payload: any) {
    this.logger.log(`Received Flutterwave webhook event: ${payload?.event}`);

    const eventId = payload?.data?.id ? String(payload.data.id) : String(payload?.id || 'unknown');

    // Replay protection via Redis
    const isNewWebhook = await this.redisService.setNxWithExpiry(`webhook_tx:${eventId}`, '1', 86400); // 24 hours expiry
    if (!isNewWebhook) {
      this.logger.warn(`Webhook replay detected and rejected: ${eventId}`);
      throw new ConflictException('Duplicate webhook received');
    }
    
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
