import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(@InjectQueue('webhook-dlq') private readonly webhookQueue: Queue) {}

  @Post('flutterwave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive Flutterwave payment webhooks' })
  async handleFlutterwaveWebhook(@Body() payload: any) {
    this.logger.log(`Received Flutterwave webhook event: ${payload.event}`);

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

    this.logger.log(`Webhook queued for processing (Event: ${payload.event})`);

    return { success: true };
  }
}
