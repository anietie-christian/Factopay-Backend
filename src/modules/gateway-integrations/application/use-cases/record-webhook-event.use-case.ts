// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';

interface RecordEventParams {
  provider: string;
  eventId: string;
  eventType?: string;
  signatureTs?: Date;
  metadata?: any;
}

@Injectable()
export class RecordWebhookEventUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Records a webhook event, validating timestamp and uniqueness.
   * Returns:
   * - { isDuplicate: false, status: 'RECEIVED' } if new and valid
   * - { isDuplicate: true, status: 'SKIPPED' } if already processed/recorded
   */
  async execute(params: RecordEventParams): Promise<{ isDuplicate: boolean; status: string }> {
    const { provider, eventId, eventType, signatureTs, metadata } = params;

    // 1. Check for stale timestamp if signatureTs is provided
    if (signatureTs) {
      const toleranceSeconds = this.configService.get<number>('WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS') ?? 300;
      const ageMs = Math.abs(Date.now() - signatureTs.getTime());
      if (ageMs > toleranceSeconds * 1000) {
        throw new BadRequestException('Webhook timestamp is outside the allowed tolerance window');
      }
    }

    // 2. Attempt to create WebhookEvent record
    try {
      await this.prisma.webhookEvent.create({
        data: {
          provider,
          eventId,
          eventType,
          signatureTs,
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
          status: 'RECEIVED',
        },
      });

      return { isDuplicate: false, status: 'RECEIVED' };
    } catch (error: any) {
      // Prisma Unique Constraint Violation
      if (error.code === 'P2002') {
        return { isDuplicate: true, status: 'SKIPPED' };
      }
      throw error;
    }
  }

  /**
   * Update the status of a webhook event (e.g. to PROCESSED or FAILED) after handler execution
   */
  async updateStatus(provider: string, eventId: string, status: 'PROCESSED' | 'FAILED') {
    await this.prisma.webhookEvent.update({
      where: {
        provider_eventId: { provider, eventId },
      },
      data: { status },
    });
  }
}
