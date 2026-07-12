import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { WalletRepository } from '../../domain/ports/wallet.repository';
import { LedgerRepository } from '../../domain/ports/ledger.repository';
import { DoubleEntryEngine, ProposedEntry, EntryType } from '../../domain/services/double-entry.engine';
import { InsufficientBalanceException } from '../../domain/exceptions/insufficient-balance.exception';

@Injectable()
export class PostLedgerTransactionUseCase {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('WalletRepository') private readonly walletRepo: WalletRepository,
    @Inject('LedgerRepository') private readonly ledgerRepo: LedgerRepository,
    private readonly doubleEntryEngine: DoubleEntryEngine,
  ) {}

  async execute(transactionId: string, entries: ProposedEntry[]): Promise<void> {
    // Step 1: Validate BEFORE touching the database
    this.doubleEntryEngine.validate(entries);

    // Fetch wallet IDs before starting the transaction to reduce transaction duration and connection pool load
    const startTime = Date.now();
    const walletIds = await this.getWalletIdsFromEntries(entries, this.prisma);
    console.log(`[${transactionId}] getWalletIdsFromEntries took ${Date.now() - startTime}ms`);

    await this.prisma.$transactionDirect(async (tx) => {
      // Set Postgres lock timeout so the DB aborts rather than hanging the Prisma client indefinitely
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '4s';`);

      console.log(`[${transactionId}] Entered $transactionDirect after ${Date.now() - startTime}ms`);
      // Step 2: Acquire row-level locks on ALL affected wallets, inside the transaction
      // IDs are sorted lexicographically in getWalletIdsFromEntries to prevent Postgres deadlocks
      for (const walletId of walletIds) {
        await this.walletRepo.lockForUpdate(walletId, tx);
      }
      console.log(`[${transactionId}] Acquired locks after ${Date.now() - startTime}ms`);

      // Step 3: Check balance for debit entries AFTER acquiring the lock
      const debitEntries = entries.filter(e => e.entryType === EntryType.DEBIT);
      for (const debit of debitEntries) {
        const { debits, credits } = await this.ledgerRepo.sumByAccount(debit.ledgerAccountId, tx);
        const currentBalance = credits.minus(debits);
        if (currentBalance.lessThan(debit.amount)) {
          throw new InsufficientBalanceException(
            currentBalance.toFixed(4),
            debit.amount.toFixed(4),
            debit.currency,
          );
        }
      }

      // Step 4: Insert all entries atomically
      await this.ledgerRepo.insertMany(entries, transactionId, tx);
      console.log(`[${transactionId}] Finished transaction after ${Date.now() - startTime}ms`);
    }, { maxWait: 5000, timeout: 20000 });
  }

  private async getWalletIdsFromEntries(entries: ProposedEntry[], tx: any): Promise<string[]> {
    const accountIds = [...new Set(entries.map(e => e.ledgerAccountId))];
    const accounts = await tx.ledgerAccount.findMany({
      where: { id: { in: accountIds } },
      select: { wallet_id: true }
    });
    const walletIds = Array.from(new Set<string>(accounts.map((a: any) => a.wallet_id as string)));
    // Sort to ensure consistent locking order (avoids Postgres deadlocks)
    return walletIds.sort();
  }
}
