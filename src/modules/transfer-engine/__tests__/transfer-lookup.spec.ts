import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GetTransferUseCase } from '../application/use-cases/get-transfer.use-case';
import { GetTransferByKeyUseCase } from '../application/use-cases/get-transfer-by-key.use-case';
import { ListTransfersUseCase } from '../application/use-cases/list-transfers.use-case';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';

describe('Transfer Lookup Use Cases', () => {
  let getTransfer: GetTransferUseCase;
  let getByKey: GetTransferByKeyUseCase;
  let listTransfers: ListTransfersUseCase;
  let prisma: Record<string, any>;

  const userId = 'user-001';
  const otherUserId = 'user-999';
  const transferId = 'tx-001';
  const idempotencyKey = 'idem-key-001';

  const mockTransfer = {
    id: transferId,
    userId,
    amount: '100.0000',
    currency: 'EUR',
    status: 'COMPLETED',
    idempotencyKey,
    createdAt: new Date('2026-07-16T10:00:00Z'),
    updatedAt: new Date('2026-07-16T10:05:00Z'),
  };

  beforeEach(async () => {
    prisma = {
      transfer: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([mockTransfer]),
        count: jest.fn().mockResolvedValue(1),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetTransferUseCase,
        GetTransferByKeyUseCase,
        ListTransfersUseCase,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    getTransfer = module.get(GetTransferUseCase);
    getByKey = module.get(GetTransferByKeyUseCase);
    listTransfers = module.get(ListTransfersUseCase);
  });

  describe('GetTransferUseCase', () => {
    it('should return a transfer owned by the user', async () => {
      prisma.transfer.findFirst.mockResolvedValue(mockTransfer);

      const result = await getTransfer.execute(userId, transferId);
      expect(result).toEqual(mockTransfer);
      expect(prisma.transfer.findFirst).toHaveBeenCalledWith({
        where: { id: transferId, userId },
      });
    });

    it('should throw 404 if the transfer does not exist', async () => {
      prisma.transfer.findFirst.mockResolvedValue(null);

      await expect(getTransfer.execute(userId, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should not return transfers owned by a different user', async () => {
      prisma.transfer.findFirst.mockResolvedValue(null);

      await expect(getTransfer.execute(otherUserId, transferId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('GetTransferByKeyUseCase', () => {
    it('should return a transfer found by idempotency key', async () => {
      prisma.transfer.findFirst.mockResolvedValue(mockTransfer);

      const result = await getByKey.execute(userId, idempotencyKey);
      expect(result).toEqual(mockTransfer);
      expect(prisma.transfer.findFirst).toHaveBeenCalledWith({
        where: { idempotencyKey, userId },
      });
    });

    it('should throw 404 for an unknown idempotency key', async () => {
      prisma.transfer.findFirst.mockResolvedValue(null);

      await expect(getByKey.execute(userId, 'unknown-key')).rejects.toThrow(NotFoundException);
    });
  });

  describe('ListTransfersUseCase', () => {
    it('should return paginated transfers for the user', async () => {
      const result = await listTransfers.execute(userId, { page: 1, limit: 20 });

      expect(result.data).toEqual([mockTransfer]);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it('should filter by status when provided', async () => {
      await listTransfers.execute(userId, { status: 'COMPLETED', page: 1, limit: 10 });

      expect(prisma.transfer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, status: 'COMPLETED' },
        }),
      );
    });

    it('should correctly calculate pagination for multiple pages', async () => {
      prisma.transfer.count.mockResolvedValue(45);

      const result = await listTransfers.execute(userId, { page: 2, limit: 20 });
      expect(result.pagination.totalPages).toBe(3);
      expect(prisma.transfer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20 }),
      );
    });
  });
});
