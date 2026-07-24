// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { webhookBackoffStrategy } from '../../infrastructure/bullmq/custom-backoff';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { RecordWebhookEventUseCase } from '../use-cases/record-webhook-event.use-case';

@Processor('webhook-dlq', {
  settings: {
    backoffStrategy: webhookBackoffStrategy,
  },
})
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recordWebhookUseCase: RecordWebhookEventUseCase,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing webhook job ${job.id} for event ${job.name}`);

    const payload = job.data;
    const eventId = payload?.data?.id ? String(payload.data.id) : String(payload?.id || 'unknown');

    try {
      let result;
      switch (job.name) {
        case 'process_flutterwave':
          result = await this.processFlutterwaveWebhook(payload);
          break;
        default:
          this.logger.warn(`Unknown job name: ${job.name}`);
          result = { processed: false };
      }

      await this.recordWebhookUseCase.updateStatus('FLUTTERWAVE', eventId, 'PROCESSED');
      return result;
    } catch (error) {
      await this.recordWebhookUseCase.updateStatus('FLUTTERWAVE', eventId, 'FAILED');
      throw error;
    }
  }

  private async processFlutterwaveWebhook(payload: any) {
    this.logger.log(`Attempting to process Flutterwave payload: ${payload.event}`);

    // Normally we would use Prisma here to update a Transfer status.
    // e.g. await this.prisma.transfer.update({ ... });
    // Let's simulate a failure for testing the retry logic if the tx_ref is "FAIL_ME".
    if (payload.data?.tx_ref === 'FAIL_ME') {
      this.logger.error('Simulated failure triggered for webhook processing.');
      throw new Error('Database connection failed (Simulated)');
    }

    if (payload.event === 'charge.completed') {
      this.logger.log(`Payment successful for tx_ref: ${payload.data?.tx_ref}`);
    } else if (payload.event === 'charge.failed') {
      this.logger.error(`Payment failed for tx_ref: ${payload.data?.tx_ref}`);
    } else {
      this.logger.warn(`Unhandled webhook event: ${payload.event}`);
    }

    return { processed: true };
  }
}
