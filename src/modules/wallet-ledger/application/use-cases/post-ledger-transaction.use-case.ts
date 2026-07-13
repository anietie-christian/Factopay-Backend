import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { WalletRepository } from '../../domain/ports/wallet.repository';
import { LedgerRepository } from '../../domain/ports/ledger.repository';
import { DoubleEntryEngine, ProposedEntry, EntryType } from '../../domain/services/double-entry.engine';
import { InsufficientBalanceException } from '../../domain/exceptions/insufficient-balance.exception';
import { Decimal } from 'decimal.js';

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
    const { walletIds, exemptAccountIds } = await this.getWalletIdsFromEntries(entries, this.prisma);

    await this.prisma.$transactionDirect(async (tx) => {
      // Set Postgres lock timeout so the DB aborts rather than hanging the Prisma client indefinitely
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '4s';`);

      // Step 2: Acquire row-level locks on ALL affected wallets, inside the transaction
      // IDs are sorted lexicographically in getWalletIdsFromEntries to prevent Postgres deadlocks
      for (const walletId of walletIds) {
        await this.walletRepo.lockForUpdate(walletId, tx);
      }

      // Step 3: Check balance for debit entries AFTER acquiring the lock
      const debitEntries = entries.filter(e => e.entryType === EntryType.DEBIT);
      for (const debit of debitEntries) {
        // Exempt SYSTEM/LIQUIDITY wallets from STRICT balance checks, but enforce a safety floor
        if (exemptAccountIds.has(debit.ledgerAccountId)) {
          const { debits, credits } = await this.ledgerRepo.sumByAccount(debit.ledgerAccountId, tx);
          const currentBalance = credits.minus(debits);
          
          const SYSTEM_WALLET_FLOOR = new Decimal('-1000000'); // -1,000,000 safety floor
          if (currentBalance.minus(debit.amount).lessThan(SYSTEM_WALLET_FLOOR)) {
            throw new Error(`CRITICAL: System/Liquidity wallet balance dropped below safe floor (${SYSTEM_WALLET_FLOOR.toString()}). Intervention required.`);
          }
          continue;
        }

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
    }, { maxWait: 5000, timeout: 20000 });
  }

  private async getWalletIdsFromEntries(entries: ProposedEntry[], tx: any): Promise<{ walletIds: string[], exemptAccountIds: Set<string> }> {
    const accountIds = [...new Set(entries.map(e => e.ledgerAccountId))];
    const accounts = await tx.ledgerAccount.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, wallet_id: true, wallet: { select: { wallet_type: true } } }
    });
    
    const walletIds = Array.from(new Set<string>(accounts.map((a: any) => a.wallet_id as string))).sort();
    
    const exemptAccountIds = new Set<string>();
    for (const acc of accounts) {
      if (acc.wallet.wallet_type === 'LIQUIDITY' || acc.wallet.wallet_type === 'SYSTEM') {
        exemptAccountIds.add(acc.id as string);
      }
    }
    
    return { walletIds, exemptAccountIds };
  }
}
