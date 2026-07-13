import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { WalletRepository } from '../../domain/ports/wallet.repository';
import { LedgerRepository } from '../../domain/ports/ledger.repository';
import { DoubleEntryEngine, ProposedEntry, EntryType } from '../../domain/services/double-entry.engine';
import { InsufficientBalanceException } from '../../domain/exceptions/insufficient-balance.exception';
import { Decimal } from 'decimal.js';

@Injectable()
export class PostLedgerTransactionUseCase {
  private readonly systemWalletFloor: Decimal;

  constructor(
    private readonly prisma: PrismaService,
    @Inject('WalletRepository') private readonly walletRepo: WalletRepository,
    @Inject('LedgerRepository') private readonly ledgerRepo: LedgerRepository,
    private readonly doubleEntryEngine: DoubleEntryEngine,
    private readonly configService: ConfigService,
  ) {
    this.systemWalletFloor = new Decimal(
      this.configService.get<string>('SYSTEM_WALLET_FLOOR', '-1000000'),
    );
  }

  async execute(transactionId: string, entries: ProposedEntry[]): Promise<void> {
    // Step 1: Validate BEFORE touching the database
    this.doubleEntryEngine.validate(entries);

    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
      try {
        await this.prisma.$transactionDirect(async (tx) => {
          // Set Postgres lock timeout so the DB aborts rather than hanging the Prisma client indefinitely
          await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '4s';`);

          // Fetch wallet IDs INSIDE the transaction to close the race condition 
          // where a wallet could be modified/deleted between lookup and lock.
          const { walletIds, exemptAccountIds } = await this.getWalletIdsFromEntries(entries, tx);

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
              
              if (currentBalance.minus(debit.amount).lessThan(this.systemWalletFloor)) {
                throw new Error(`CRITICAL: System/Liquidity wallet balance dropped below safe floor (${this.systemWalletFloor.toString()}). Intervention required.`);
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
        
        // If we get here, the transaction succeeded, break out of retry loop
        break;
      } catch (error: any) {
        // Prisma bubbles up raw database errors sometimes via code property
        if (error.code === '55P03' || (error.message && error.message.includes('lock_timeout'))) {
          attempt++;
          if (attempt > MAX_RETRIES) {
            throw new Error(`Transfer failed after ${MAX_RETRIES} attempts due to database lock contention.`);
          }
          // Exponential backoff with jitter: e.g. 50ms, 100ms, 200ms
          const delay = Math.floor(Math.random() * 50) + (Math.pow(2, attempt - 1) * 50);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error; // Not a lock timeout, rethrow immediately
        }
      }
    }
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
