import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { WalletType, AccountType, EntryType } from '@prisma/client';
import { ConfigModule } from '@nestjs/config';
import { randomUUID } from 'crypto';

describe('Ledger Immutability (Database Level)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [PrismaService],
    }).compile();

    prisma = module.get(PrismaService);
  });

  it('should prevent UPDATE/DELETE operations on ledger_entries and ledger_accounts via Postgres triggers', async () => {
    // 1. Create a dummy wallet and account
    const wallet = await prisma.wallet.create({
      data: {
        wallet_type: WalletType.SETTLEMENT,
        currency: 'USD',
        user_id: randomUUID(),
      },
    });

    const account = await prisma.ledgerAccount.create({
      data: {
        wallet: { connect: { id: wallet.id } },
        account_type: AccountType.LIABILITY,
        name: 'System Liability',
        currency: 'USD',
      },
    });

    // 2. Insert a ledger entry
    const entry = await prisma.ledgerEntry.create({
      data: {
        account: { connect: { id: account.id } },
        entry_type: EntryType.CREDIT,
        amount: 100,
        currency: 'USD',
        transaction_id: randomUUID(),
        reference_id: randomUUID(),
        description: 'Initial deposit',
      },
    });

    // 3. Attempt a raw UPDATE on the ledger entry
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE ledger_entries SET amount = 999 WHERE id = '${entry.id}'`
      )
    ).rejects.toThrow(/immutable/i);

    // 4. Attempt DELETE on ledger entry
    await expect(
      prisma.$executeRawUnsafe(
        `DELETE FROM ledger_entries WHERE id = '${entry.id}'`
      )
    ).rejects.toThrow(/immutable/i);

    // 5. Attempt DELETE on ledger account
    await expect(
      prisma.$executeRawUnsafe(
        `DELETE FROM ledger_accounts WHERE id = '${account.id}'`
      )
    ).rejects.toThrow(/deleted/i);

    // Clean up
    await prisma.$executeRawUnsafe('ALTER TABLE ledger_entries DISABLE TRIGGER ledger_immutability_trigger');
    await prisma.$executeRawUnsafe('ALTER TABLE ledger_accounts DISABLE TRIGGER ledger_account_delete_trigger');
    await prisma.ledgerEntry.delete({ where: { id: entry.id } }).catch(() => {});
    await prisma.ledgerAccount.delete({ where: { id: account.id } }).catch(() => {});
    await prisma.wallet.delete({ where: { id: wallet.id } }).catch(() => {});
    await prisma.$executeRawUnsafe('ALTER TABLE ledger_entries ENABLE TRIGGER ledger_immutability_trigger');
    await prisma.$executeRawUnsafe('ALTER TABLE ledger_accounts ENABLE TRIGGER ledger_account_delete_trigger');
  }, 60000);
});
