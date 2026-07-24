// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { ModuleRef } from '@nestjs/core';
import { HandleKycWebhookUseCase } from '../../../kyc-management/application/use-cases/handle-kyc-webhook.use-case';

@Injectable()
export class WebhookReconciliationWorker {
  private readonly logger = new Logger(WebhookReconciliationWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly moduleRef: ModuleRef,
    @InjectQueue('webhook-dlq') private readonly webhookQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async reconcileWebhooks() {
    this.logger.log('Starting Webhook reconciliation job...');

    // Find webhook events that are FAILED or stuck in RECEIVED status for more than 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const stuckEvents = await this.prisma.webhookEvent.findMany({
      where: {
        OR: [
          { status: 'FAILED' },
          {
            status: 'RECEIVED',
            receivedAt: {
              lt: fifteenMinutesAgo,
            },
          },
        ],
      },
    });

    this.logger.log(`Found ${stuckEvents.length} stuck or failed webhook events to reconcile.`);

    for (const event of stuckEvents) {
      const metadata = (event.metadata ? JSON.parse(JSON.stringify(event.metadata)) : {}) as any;
      const retries = (metadata._retries || 0) + 1;

      if (retries > 5) {
        this.logger.error(`Webhook event ${event.id} (${event.provider}) exceeded max retries. Marking as FAILED_PERMANENTLY.`);
        
        await this.prisma.webhookEvent.update({
          where: { id: event.id },
          data: {
            status: 'FAILED_PERMANENTLY',
            metadata,
          },
        });

        // Raise HIGH alert
        await this.prisma.alertRecord.create({
          data: {
            ruleName: 'WEBHOOK_MAX_RETRIES_EXCEEDED',
            severity: 'HIGH',
            status: 'OPEN',
            targetId: event.id,
            targetType: 'WEBHOOK_EVENT',
            metadata: {
              provider: event.provider,
              eventId: event.eventId,
              eventType: event.eventType,
              retries,
            },
          },
        });

        continue;
      }

      metadata._retries = retries;
      this.logger.log(`Retrying webhook event ${event.id} (provider: ${event.provider}, attempt: ${retries})`);

      try {
        if (event.provider === 'FLUTTERWAVE') {
          // Re-queue to BullMQ
          await this.webhookQueue.add('process_flutterwave', metadata, {
            attempts: 5,
            backoff: {
              type: 'webhookBackoffStrategy',
            },
          });

          // Mark as RECEIVED since it's back in queue
          await this.prisma.webhookEvent.update({
            where: { id: event.id },
            data: {
              status: 'RECEIVED',
              metadata,
            },
          });

        } else if (event.provider === 'TRANSAK') {
          // Re-emit internal event
          this.eventEmitter.emit(`transak.${event.eventType}`, metadata);

          // Update status to PROCESSED
          await this.prisma.webhookEvent.update({
            where: { id: event.id },
            data: {
              status: 'PROCESSED',
              metadata,
            },
          });

        } else if (event.provider === 'SUMSUB') {
          // Resolve HandleKycWebhookUseCase at runtime to prevent circular dependency
          const handleKycWebhookUseCase = this.moduleRef.get(HandleKycWebhookUseCase, { strict: false });
          
          // Re-invoke SUMSUB webhook business logic directly (bypassing signature checks)
          await handleKycWebhookUseCase.processReviewResult(metadata);

          // Update status to PROCESSED
          await this.prisma.webhookEvent.update({
            where: { id: event.id },
            data: {
              status: 'PROCESSED',
              metadata,
            },
          });
        }
      } catch (error) {
        this.logger.error(`Failed retry attempt ${retries} for webhook event ${event.id}`, error);
        
        await this.prisma.webhookEvent.update({
          where: { id: event.id },
          data: {
            status: 'FAILED',
            metadata,
          },
        });
      }
    }

    this.logger.log('Webhook reconciliation job finished.');
  }
}
