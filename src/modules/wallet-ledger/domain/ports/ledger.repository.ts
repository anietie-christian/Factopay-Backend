import { LedgerEntry } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { ProposedEntry } from '../services/double-entry.engine';
import { PrismaTransaction } from './wallet.repository';

export interface LedgerRepository {
  insertMany(entries: ProposedEntry[], transactionId: string, tx: PrismaTransaction): Promise<void>;
  sumByAccount(ledgerAccountId: string, tx?: PrismaTransaction): Promise<{ debits: Decimal; credits: Decimal }>;
  paginateByAccount(ledgerAccountId: string, page: number, limit: number): Promise<LedgerEntry[]>;
}
