import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { LedgerRepository } from '../../domain/ports/ledger.repository';
import { ProposedEntry } from '../../domain/services/double-entry.engine';
import { PrismaTransaction } from '../../domain/ports/wallet.repository';
import { LedgerEntry } from '@prisma/client';
import { Decimal } from 'decimal.js';

@Injectable()
export class PrismaLedgerRepository implements LedgerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insertMany(entries: ProposedEntry[], transactionId: string, tx: PrismaTransaction): Promise<void> {
    const db = tx || this.prisma;
    
    await db.ledgerEntry.createMany({
      data: entries.map(e => ({
        transaction_id: transactionId,
        ledger_account_id: e.ledgerAccountId,
        entry_type: e.entryType,
        amount: e.amount,
        currency: e.currency,
        description: e.description,
        reference_type: e.referenceType,
        reference_id: e.referenceId,
      })),
    });
  }

  async sumByAccount(accountId: string, tx?: PrismaTransaction): Promise<{ debits: Decimal; credits: Decimal }> {
    const db = tx || this.prisma;
    
    // Using raw SQL instead of Prisma's groupBy to bypass a known Prisma query engine deadlock 
    // when running concurrent interactive transactions over a direct unpooled connection.
    const result: any[] = await db.$queryRaw`
      SELECT 
        COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0) as total_debits,
        COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0) as total_credits
      FROM ledger_entries
      WHERE ledger_account_id = ${accountId}::uuid
    `;
    
    return {
      debits: new Decimal(result[0].total_debits),
      credits: new Decimal(result[0].total_credits)
    };
  }

  async paginateByAccount(ledgerAccountId: string, page: number, limit: number): Promise<LedgerEntry[]> {
    const skip = (page - 1) * limit;
    return this.prisma.ledgerEntry.findMany({
      where: { ledger_account_id: ledgerAccountId },
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
    });
  }
}
