import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { PostLedgerTransactionUseCase } from './post-ledger-transaction.use-case';
import { ProposedEntry, EntryType } from '../../domain/services/double-entry.engine';
import { Decimal } from 'decimal.js';
import { v5 as uuidv5, v4 as uuidv4 } from 'uuid';

const REVERSAL_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // standard DNS namespace, just used as a seed

@Injectable()
export class ReverseLedgerTransactionUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly postLedgerTransactionUseCase: PostLedgerTransactionUseCase,
  ) {}

  async execute(originalTransactionId: string, reversalId?: string): Promise<void> {
    // 1. Fetch original entries
    const originalEntries = await this.prisma.ledgerEntry.findMany({
      where: { transaction_id: originalTransactionId }
    });

    if (originalEntries.length === 0) {
      throw new Error(`Original transaction ${originalTransactionId} not found in ledger`);
    }

    // 2. Generate inverse entries
    const reversedEntries: ProposedEntry[] = originalEntries.map(entry => {
      // Swap DEBIT to CREDIT, and CREDIT to DEBIT
      const reversedType = entry.entry_type === 'DEBIT' ? EntryType.CREDIT : EntryType.DEBIT;
      
      return {
        ledgerAccountId: entry.ledger_account_id,
        amount: new Decimal(entry.amount.toString()),
        currency: entry.currency,
        entryType: reversedType,
        description: `Reversal of ${originalTransactionId}: ${entry.description || ''}`,
      };
    });

    // 3. Post them using the same locking/idempotency path
    // Generate a deterministic valid UUID for the reversal to ensure idempotency
    const txId = reversalId || uuidv5(`${originalTransactionId}-rev`, REVERSAL_NAMESPACE);
    await this.postLedgerTransactionUseCase.execute(txId, reversedEntries);
  }
}
