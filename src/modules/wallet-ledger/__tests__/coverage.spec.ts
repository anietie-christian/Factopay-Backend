import { Test, TestingModule } from '@nestjs/testing';
import { PostLedgerTransactionUseCase } from '../application/use-cases/post-ledger-transaction.use-case';
import { PrismaWalletRepository } from '../infrastructure/repositories/prisma-wallet.repository';
import { DoubleEntryEngine, EntryType } from '../domain/services/double-entry.engine';
import { InsufficientBalanceException } from '../domain/exceptions/insufficient-balance.exception';
import { UnbalancedEntriesException } from '../domain/exceptions/unbalanced-entries.exception';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { Decimal } from 'decimal.js';
import { v4 as uuid } from 'uuid';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { CalculateBalanceUseCase } from '../application/use-cases/calculate-balance.use-case';
import { WalletController } from '../infrastructure/controllers/wallet.controller';
import { PrismaLedgerRepository } from '../infrastructure/repositories/prisma-ledger.repository';

describe('Coverage Specs', () => {
  describe('Exceptions', () => {
    it('should format InsufficientBalanceException correctly', () => {
      const ex = new InsufficientBalanceException('10', '50', 'EUR');
      expect(ex.message).toContain('Insufficient balance: have 10 EUR, need 50 EUR');
    });

    it('should format UnbalancedEntriesException correctly', () => {
      const ex = new UnbalancedEntriesException('10', '5');
      expect(ex.message).toContain('Double-entry violation: debits 10 ≠ credits 5');
    });
  });

  describe('PrismaWalletRepository', () => {
    let repo: PrismaWalletRepository;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([]),
      };
      repo = new PrismaWalletRepository(mockPrisma as any);
    });

    it('should throw NotFoundException if wallet to lock is not found', async () => {
      await expect(repo.lockForUpdate(uuid(), mockPrisma)).rejects.toThrow(NotFoundException);
    });
  });

  describe('PostLedgerTransactionUseCase', () => {
    let useCase: PostLedgerTransactionUseCase;
    let mockPrisma: any;
    let mockWalletRepo: any;
    let mockLedgerRepo: any;
    let mockEngine: any;

    beforeEach(() => {
      mockPrisma = {
        $transaction: jest.fn(async (cb) => cb(mockPrisma)),
        $transactionDirect: jest.fn(async (cb) => cb(mockPrisma)),
        $executeRawUnsafe: jest.fn().mockResolvedValue(0),
        ledgerAccount: {
          findMany: jest.fn().mockResolvedValue([{ wallet_id: uuid(), wallet: { wallet_type: 'USER' } }])
        }
      };
      mockWalletRepo = { lockForUpdate: jest.fn() };
      mockLedgerRepo = {
        sumByAccount: jest.fn().mockResolvedValue({ debits: new Decimal(0), credits: new Decimal(10) }),
        insertMany: jest.fn()
      };
      mockEngine = { validate: jest.fn() };

      useCase = new PostLedgerTransactionUseCase(
        mockPrisma,
        mockWalletRepo,
        mockLedgerRepo,
        mockEngine
      );
    });

    it('should throw InsufficientBalanceException if debit exceeds balance', async () => {
      const entries = [
        { ledgerAccountId: uuid(), entryType: EntryType.DEBIT, amount: new Decimal(50), currency: 'EUR', description: 'desc' }
      ];
      
      await expect(useCase.execute('tx-1', entries as any)).rejects.toThrow(InsufficientBalanceException);
    });
  });

  describe('CalculateBalanceUseCase', () => {
    let useCase: CalculateBalanceUseCase;
    let mockWalletRepo: any;
    let mockLedgerRepo: any;

    beforeEach(() => {
      mockWalletRepo = { findByUserAndCurrency: jest.fn() };
      mockLedgerRepo = { sumByAccount: jest.fn() };
      useCase = new CalculateBalanceUseCase(mockWalletRepo, mockLedgerRepo);
    });

    it('should throw NotFoundException if wallet is missing', async () => {
      mockWalletRepo.findByUserAndCurrency.mockResolvedValue(null);
      await expect(useCase.execute(uuid(), 'EUR')).rejects.toThrow(NotFoundException);
    });

    it('should return balance if wallet exists', async () => {
      mockWalletRepo.findByUserAndCurrency.mockResolvedValue({ accounts: [{ id: 'a1' }] });
      mockLedgerRepo.sumByAccount.mockResolvedValue({ credits: new Decimal(100), debits: new Decimal(40) });
      const bal = await useCase.execute(uuid(), 'EUR');
      expect(bal.toString()).toBe('60');
    });
  });

  describe('WalletController', () => {
    let controller: WalletController;
    let mockCalculate: any;
    let mockLedgerRepo: any;
    let mockWalletRepo: any;

    beforeEach(() => {
      mockCalculate = { execute: jest.fn().mockResolvedValue(new Decimal(10)) };
      mockLedgerRepo = { paginateByAccount: jest.fn().mockResolvedValue([]) };
      mockWalletRepo = { findByUserAndCurrency: jest.fn() };
      controller = new WalletController(mockCalculate, mockLedgerRepo, mockWalletRepo);
    });

    it('should block USER from accessing another user balance', async () => {
      const req = { user: { role: 'USER', id: 'u1' } };
      await expect(controller.getBalance(req, 'u2', 'EUR')).rejects.toThrow(ForbiddenException);
    });

    it('should allow ADMIN to access another user balance', async () => {
      const req = { user: { role: 'ADMIN', id: 'a1' } };
      const result = await controller.getBalance(req, 'u2', 'EUR');
      expect(result.balance).toBe('10');
    });

    it('should block USER from accessing another user ledger', async () => {
      const req = { user: { role: 'USER', id: 'u1' } };
      await expect(controller.getLedger(req, 'u2', 'EUR')).rejects.toThrow(ForbiddenException);
    });

    it('should allow USER to access own ledger', async () => {
      const req = { user: { role: 'USER', id: 'u1' } };
      mockWalletRepo.findByUserAndCurrency.mockResolvedValue({ accounts: [{ id: 'a1' }] });
      const result = await controller.getLedger(req, 'u1', 'EUR');
      expect(result.entries).toEqual([]);
    });

    it('should throw NotFoundException if ledger wallet not found', async () => {
      const req = { user: { role: 'USER', id: 'u1' } };
      mockWalletRepo.findByUserAndCurrency.mockResolvedValue(null);
      await expect(controller.getLedger(req, 'u1', 'EUR')).rejects.toThrow(NotFoundException);
    });
  });

  describe('PrismaLedgerRepository', () => {
    let repo: PrismaLedgerRepository;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        ledgerEntry: {
          createMany: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        $queryRaw: jest.fn().mockResolvedValue([{ debits: 0, credits: 0 }]),
      };
      repo = new PrismaLedgerRepository(mockPrisma);
    });

    it('should handle insertMany with empty entries', async () => {
      await repo.insertMany([], 'tx-1', mockPrisma);
      expect(mockPrisma.ledgerEntry.createMany).toHaveBeenCalledWith({ data: [] });
    });

    it('should call createMany for entries', async () => {
      await repo.insertMany([
        { ledgerAccountId: uuid(), entryType: EntryType.CREDIT, amount: new Decimal(10), currency: 'EUR', description: '' }
      ] as any, 'tx-1', mockPrisma);
      expect(mockPrisma.ledgerEntry.createMany).toHaveBeenCalled();
    });

    it('should skip creation if transaction entries already exist (idempotent)', async () => {
      mockPrisma.ledgerEntry.findFirst.mockResolvedValueOnce({ id: 'existing-1' });
      await repo.insertMany([
        { ledgerAccountId: uuid(), entryType: EntryType.CREDIT, amount: new Decimal(10), currency: 'EUR', description: '' }
      ] as any, 'tx-1', mockPrisma);
      expect(mockPrisma.ledgerEntry.createMany).not.toHaveBeenCalled();
    });

    it('should paginate entries', async () => {
      await repo.paginateByAccount('a1', 2, 10);
      expect(mockPrisma.ledgerEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
        skip: 10,
        take: 10,
      }));
    });
  });
});
