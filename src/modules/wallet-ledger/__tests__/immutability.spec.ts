import { Test, TestingModule } from '@nestjs/testing';
import { LedgerImmutabilityEnforcer } from '../infrastructure/services/ledger-immutability-enforcer.service';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';

describe('LedgerImmutabilityEnforcer', () => {
  let enforcer: LedgerImmutabilityEnforcer;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerImmutabilityEnforcer,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    enforcer = module.get(LedgerImmutabilityEnforcer);
  });

  it('should execute the raw trigger DDL on database startup', async () => {
    await enforcer.onModuleInit();

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(6);
    
    // Check that one of the calls creates the trigger function
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('CREATE OR REPLACE FUNCTION prevent_ledger_mutation')
    );

    // Check that one of the calls creates the delete block trigger function
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('CREATE OR REPLACE FUNCTION prevent_ledger_account_delete')
    );

    // Check that one of the calls drops the ledger_entries trigger
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('DROP TRIGGER IF EXISTS trg_prevent_ledger_entries_mutation')
    );

    // Check that one of the calls creates the ledger_entries trigger binding
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('CREATE TRIGGER trg_prevent_ledger_entries_mutation')
    );

    // Check that one of the calls drops the ledger_accounts trigger
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('DROP TRIGGER IF EXISTS trg_prevent_ledger_accounts_delete')
    );

    // Check that one of the calls creates the ledger_accounts trigger binding
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      6,
      expect.stringContaining('CREATE TRIGGER trg_prevent_ledger_accounts_delete')
    );
  });

  it('should not throw if the database execution fails (graceful fallback)', async () => {
    prisma.$executeRawUnsafe.mockRejectedValue(new Error('Syntax error or unsupported dialect'));

    await expect(enforcer.onModuleInit()).resolves.not.toThrow();
  });
});
