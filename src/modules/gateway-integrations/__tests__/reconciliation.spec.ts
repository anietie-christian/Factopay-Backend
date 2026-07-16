import { Test, TestingModule } from '@nestjs/testing';
import { BlockchainReconciliationWorker } from '../application/workers/blockchain-reconciliation.worker';
import { WebhookReconciliationWorker } from '../application/workers/webhook-reconciliation.worker';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { VerifySettlementUseCase } from '../../blockchain-settlement/application/use-cases/verify-settlement.use-case';
import { ReverseLedgerTransactionUseCase } from '../../wallet-ledger/application/use-cases/reverse-ledger-transaction.use-case';
import { HandleKycWebhookUseCase } from '../../kyc-management/application/use-cases/handle-kyc-webhook.use-case';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';
import { ModuleRef } from '@nestjs/core';

describe('Reconciliation Workers', () => {
  let blockchainWorker: BlockchainReconciliationWorker;
  let webhookWorker: WebhookReconciliationWorker;
  let prisma: Record<string, any>;
  let verifySettlement: Record<string, any>;
  let reverseLedger: Record<string, any>;
  let handleKycWebhook: Record<string, any>;
  let eventEmitter: Record<string, any>;
  let webhookQueue: Record<string, any>;
  let moduleRef: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      blockchainTransaction: {
        findMany: jest.fn(),
      },
      transfer: {
        update: jest.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, status: args.data.status, amount: 100, currency: 'USD', userId: 'user-1' })),
      },
      alertRecord: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
      },
      webhookEvent: {
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    verifySettlement = {
      execute: jest.fn(),
    };

    reverseLedger = {
      execute: jest.fn().mockResolvedValue({}),
    };

    handleKycWebhook = {
      processReviewResult: jest.fn().mockResolvedValue({}),
    };

    eventEmitter = {
      emit: jest.fn(),
    };

    webhookQueue = {
      add: jest.fn().mockResolvedValue({}),
    };

    moduleRef = {
      get: jest.fn().mockImplementation((token) => {
        if (token === HandleKycWebhookUseCase) return handleKycWebhook;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlockchainReconciliationWorker,
        WebhookReconciliationWorker,
        { provide: PrismaService, useValue: prisma },
        { provide: VerifySettlementUseCase, useValue: verifySettlement },
        { provide: ReverseLedgerTransactionUseCase, useValue: reverseLedger },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: 'BullQueue_webhook-dlq', useValue: webhookQueue },
        { provide: ModuleRef, useValue: moduleRef },
      ],
    }).compile();

    blockchainWorker = module.get(BlockchainReconciliationWorker);
    webhookWorker = module.get(WebhookReconciliationWorker);
  });

  describe('BlockchainReconciliationWorker', () => {
    it('should reconcile successful transactions and update transfer status', async () => {
      prisma.blockchainTransaction.findMany.mockResolvedValue([
        { id: 'tx-1', transferId: 'tr-1', status: 'PENDING_VERIFICATION', createdAt: new Date() },
      ]);
      verifySettlement.execute.mockResolvedValue({ id: 'tx-1', status: 'SUCCESS' });

      await blockchainWorker.reconcileTransactions();

      expect(verifySettlement.execute).toHaveBeenCalledWith('tx-1');
      expect(prisma.transfer.update).toHaveBeenCalledWith({
        where: { id: 'tr-1' },
        data: { status: 'COMPLETED' },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('transfer.completed', expect.any(Object));
    });

    it('should reconcile failed transactions, reverse ledger, and update transfer status', async () => {
      prisma.blockchainTransaction.findMany.mockResolvedValue([
        { id: 'tx-2', transferId: 'tr-2', status: 'PENDING_VERIFICATION', createdAt: new Date() },
      ]);
      verifySettlement.execute.mockResolvedValue({ id: 'tx-2', status: 'FAILED', errorMessage: 'Horizon error' });

      await blockchainWorker.reconcileTransactions();

      expect(verifySettlement.execute).toHaveBeenCalledWith('tx-2');
      expect(reverseLedger.execute).toHaveBeenCalledWith('tr-2');
      expect(prisma.transfer.update).toHaveBeenCalledWith({
        where: { id: 'tr-2' },
        data: { status: 'FAILED' },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('transfer.failed', expect.any(Object));
    });

    it('should raise alert for transaction stuck > 1 hour', async () => {
      const longAgo = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      prisma.blockchainTransaction.findMany.mockResolvedValue([
        { id: 'tx-3', transferId: 'tr-3', txHash: '0xabc', status: 'PENDING_VERIFICATION', createdAt: longAgo, amount: 100 },
      ]);
      verifySettlement.execute.mockResolvedValue({ id: 'tx-3', status: 'PENDING_VERIFICATION' });
      prisma.alertRecord.findFirst.mockResolvedValue(null);

      await blockchainWorker.reconcileTransactions();

      expect(prisma.alertRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ruleName: 'BLOCKCHAIN_VERIFICATION_STUCK',
            severity: 'HIGH',
            targetId: 'tx-3',
          }),
        }),
      );
    });
  });

  describe('WebhookReconciliationWorker', () => {
    it('should retry Flutterwave event by adding back to queue', async () => {
      prisma.webhookEvent.findMany.mockResolvedValue([
        { id: 'evt-1', provider: 'FLUTTERWAVE', eventId: 'flw-1', eventType: 'charge.completed', metadata: { _retries: 1 } },
      ]);

      await webhookWorker.reconcileWebhooks();

      expect(webhookQueue.add).toHaveBeenCalledWith('process_flutterwave', expect.objectContaining({ _retries: 2 }), expect.any(Object));
      expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: {
          status: 'RECEIVED',
          metadata: expect.objectContaining({ _retries: 2 }),
        },
      });
    });

    it('should retry Transak event by re-emitting', async () => {
      prisma.webhookEvent.findMany.mockResolvedValue([
        { id: 'evt-2', provider: 'TRANSAK', eventId: 'ts-2', eventType: 'kyc.approved', metadata: {} },
      ]);

      await webhookWorker.reconcileWebhooks();

      expect(eventEmitter.emit).toHaveBeenCalledWith('transak.kyc.approved', expect.objectContaining({ _retries: 1 }));
      expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-2' },
        data: {
          status: 'PROCESSED',
          metadata: expect.objectContaining({ _retries: 1 }),
        },
      });
    });

    it('should retry Sumsub event by calling processReviewResult', async () => {
      prisma.webhookEvent.findMany.mockResolvedValue([
        { id: 'evt-3', provider: 'SUMSUB', eventId: 'ss-3', eventType: 'applicantReviewed', metadata: {} },
      ]);

      await webhookWorker.reconcileWebhooks();

      expect(handleKycWebhook.processReviewResult).toHaveBeenCalledWith(expect.objectContaining({ _retries: 1 }));
      expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-3' },
        data: {
          status: 'PROCESSED',
          metadata: expect.objectContaining({ _retries: 1 }),
        },
      });
    });

    it('should mark permanently FAILED and raise alert if retries exceed limit', async () => {
      prisma.webhookEvent.findMany.mockResolvedValue([
        { id: 'evt-4', provider: 'SUMSUB', eventId: 'ss-4', eventType: 'applicantReviewed', metadata: { _retries: 5 } },
      ]);

      await webhookWorker.reconcileWebhooks();

      expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-4' },
        data: {
          status: 'FAILED_PERMANENTLY',
          metadata: expect.objectContaining({ _retries: 5 }), // hasn't incremented since we exit early
        },
      });
      expect(prisma.alertRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ruleName: 'WEBHOOK_MAX_RETRIES_EXCEEDED',
            severity: 'HIGH',
            targetId: 'evt-4',
          }),
        }),
      );
    });
  });
});
