import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AdminListTransfersUseCase } from '../application/use-cases/admin-list-transfers.use-case';
import { AdminReviewTransferUseCase } from '../application/use-cases/admin-review-transfer.use-case';
import { AdminCancelTransferUseCase } from '../application/use-cases/admin-cancel-transfer.use-case';
import { AdminResolveTransferUseCase } from '../application/use-cases/admin-resolve-transfer.use-case';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { SubmitSettlementUseCase } from '../../blockchain-settlement/application/use-cases/submit-settlement.use-case';
import { ReverseLedgerTransactionUseCase } from '../../wallet-ledger/application/use-cases/reverse-ledger-transaction.use-case';
import { AdminAuditService } from '../../shared/infrastructure/services/admin-audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('Admin Transfer Workflows', () => {
  let listTransfers: AdminListTransfersUseCase;
  let reviewTransfer: AdminReviewTransferUseCase;
  let cancelTransfer: AdminCancelTransferUseCase;
  let resolveTransfer: AdminResolveTransferUseCase;

  let prisma: Record<string, any>;
  let submitSettlement: Record<string, any>;
  let reverseLedger: Record<string, any>;
  let adminAudit: Record<string, any>;
  let eventEmitter: Record<string, any>;

  const adminId = 'admin-uuid';
  const transferId = 'tx-uuid';

  const mockTransfer = {
    id: transferId,
    userId: 'user-1',
    recipientId: 'recipient-1',
    amount: 100,
    currency: 'USD',
    status: 'CREATED',
    adminReviewStatus: null,
  };

  beforeEach(async () => {
    prisma = {
      transfer: {
        findMany: jest.fn().mockResolvedValue([mockTransfer]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue(mockTransfer),
        update: jest.fn().mockImplementation((args) => Promise.resolve({ ...mockTransfer, ...args.data })),
      },
      stellarWallet: {
        findUnique: jest.fn().mockResolvedValue({ publicKey: 'GDESTINATION' }),
      },
    };

    submitSettlement = {
      execute: jest.fn().mockResolvedValue({ id: 'blockchain-tx-uuid', status: 'SUCCESS' }),
    };

    reverseLedger = {
      execute: jest.fn().mockResolvedValue({}),
    };

    adminAudit = {
      log: jest.fn().mockResolvedValue({}),
    };

    eventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminListTransfersUseCase,
        AdminReviewTransferUseCase,
        AdminCancelTransferUseCase,
        AdminResolveTransferUseCase,
        { provide: PrismaService, useValue: prisma },
        { provide: SubmitSettlementUseCase, useValue: submitSettlement },
        { provide: ReverseLedgerTransactionUseCase, useValue: reverseLedger },
        { provide: AdminAuditService, useValue: adminAudit },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    listTransfers = module.get(AdminListTransfersUseCase);
    reviewTransfer = module.get(AdminReviewTransferUseCase);
    cancelTransfer = module.get(AdminCancelTransferUseCase);
    resolveTransfer = module.get(AdminResolveTransferUseCase);
  });

  describe('AdminListTransfersUseCase', () => {
    it('should query and return paginated list of all transfers', async () => {
      const result = await listTransfers.execute({ page: 1, limit: 10, status: 'CREATED' });

      expect(prisma.transfer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'CREATED' }),
          skip: 0,
          take: 10,
        }),
      );
      expect(result.data).toEqual([mockTransfer]);
      expect(result.pagination.total).toBe(1);
    });
  });

  describe('AdminReviewTransferUseCase', () => {
    it('should approve transfer and submit on-chain payout', async () => {
      const result = await reviewTransfer.execute({
        transferId,
        adminId,
        decision: 'APPROVED',
        notes: 'Approved via testing',
        ipAddress: '127.0.0.1',
      });

      expect(prisma.transfer.update).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { id: transferId },
          data: expect.objectContaining({ adminReviewStatus: 'APPROVED' }),
        })
      );
      expect(submitSettlement.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          transferId,
          destinationPublicKey: 'GDESTINATION',
        })
      );
      expect(adminAudit.log).toHaveBeenCalledWith(
        adminId,
        'TRANSFER_REVIEW_APPROVED',
        'TRANSFER',
        transferId,
        expect.any(Object),
        '127.0.0.1'
      );
      expect(result.adminReviewStatus).toBe('APPROVED');
    });

    it('should reject transfer and mark status as FAILED', async () => {
      const result = await reviewTransfer.execute({
        transferId,
        adminId,
        decision: 'REJECTED',
        notes: 'Suspicious payload',
        ipAddress: '127.0.0.1',
      });

      expect(prisma.transfer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: transferId },
          data: expect.objectContaining({
            status: 'FAILED',
            failureReason: 'Rejected by admin review.',
          }),
        })
      );
      expect(submitSettlement.execute).not.toHaveBeenCalled();
      expect(adminAudit.log).toHaveBeenCalledWith(
        adminId,
        'TRANSFER_REVIEW_REJECTED',
        'TRANSFER',
        transferId,
        expect.any(Object),
        '127.0.0.1'
      );
      expect(result.adminReviewStatus).toBe('REJECTED');
    });

    it('should throw BadRequestException if transfer has already been reviewed', async () => {
      prisma.transfer.findUnique.mockResolvedValue({ ...mockTransfer, adminReviewStatus: 'APPROVED' });

      await expect(
        reviewTransfer.execute({
          transferId,
          adminId,
          decision: 'APPROVED',
          ipAddress: '127.0.0.1',
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('AdminCancelTransferUseCase', () => {
    it('should cancel the transfer, reverse ledger entries, and emit failure event', async () => {
      const result = await cancelTransfer.execute({
        transferId,
        adminId,
        reason: 'Requested by user',
        ipAddress: '127.0.0.1',
      });

      expect(reverseLedger.execute).toHaveBeenCalledWith(transferId);
      expect(prisma.transfer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: transferId },
          data: expect.objectContaining({
            status: 'CANCELLED',
            failureReason: 'Requested by user',
          }),
        })
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith('transfer.failed', expect.any(Object));
      expect(result.status).toBe('CANCELLED');
    });
  });

  describe('AdminResolveTransferUseCase', () => {
    it('should manually complete the transfer and emit transfer.completed event', async () => {
      const result = await resolveTransfer.execute({
        transferId,
        adminId,
        notes: 'Manually verified via blockchain explorer',
        ipAddress: '127.0.0.1',
      });

      expect(prisma.transfer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: transferId },
          data: expect.objectContaining({
            status: 'COMPLETED',
          }),
        })
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith('transfer.completed', expect.any(Object));
      expect(result.status).toBe('COMPLETED');
    });
  });
});
