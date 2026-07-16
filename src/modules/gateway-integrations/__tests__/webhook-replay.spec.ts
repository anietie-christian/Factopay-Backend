import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { RecordWebhookEventUseCase } from '../application/use-cases/record-webhook-event.use-case';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('Webhook Replay Protection', () => {
  let recordWebhook: RecordWebhookEventUseCase;
  let prisma: Record<string, any>;
  let configService: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      webhookEvent: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    configService = {
      get: jest.fn().mockImplementation((key) => {
        if (key === 'WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS') return 300;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecordWebhookEventUseCase,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    recordWebhook = module.get(RecordWebhookEventUseCase);
  });

  describe('execute', () => {
    it('should successfully record a new webhook event within tolerance window', async () => {
      prisma.webhookEvent.create.mockResolvedValue({});

      const signatureTs = new Date(); // now
      const result = await recordWebhook.execute({
        provider: 'FLUTTERWAVE',
        eventId: 'evt-001',
        eventType: 'charge.completed',
        signatureTs,
        metadata: { id: 'evt-001' },
      });

      expect(result).toEqual({ isDuplicate: false, status: 'RECEIVED' });
      expect(prisma.webhookEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          provider: 'FLUTTERWAVE',
          eventId: 'evt-001',
          eventType: 'charge.completed',
          status: 'RECEIVED',
        }),
      });
    });

    it('should reject webhook if the signature timestamp is older than tolerance limit', async () => {
      const signatureTs = new Date(Date.now() - 400 * 1000); // 400s ago (>300s limit)

      await expect(
        recordWebhook.execute({
          provider: 'FLUTTERWAVE',
          eventId: 'evt-001',
          signatureTs,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return isDuplicate: true if a unique constraint violation occurs', async () => {
      const error: any = new Error('Unique constraint failed');
      error.code = 'P2002';
      prisma.webhookEvent.create.mockRejectedValue(error);

      const result = await recordWebhook.execute({
        provider: 'FLUTTERWAVE',
        eventId: 'evt-duplicate',
      });

      expect(result).toEqual({ isDuplicate: true, status: 'SKIPPED' });
    });
  });

  describe('updateStatus', () => {
    it('should update event status to PROCESSED or FAILED', async () => {
      prisma.webhookEvent.update.mockResolvedValue({});

      await recordWebhook.updateStatus('FLUTTERWAVE', 'evt-001', 'PROCESSED');

      expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
        where: {
          provider_eventId: { provider: 'FLUTTERWAVE', eventId: 'evt-001' },
        },
        data: { status: 'PROCESSED' },
      });
    });
  });
});
