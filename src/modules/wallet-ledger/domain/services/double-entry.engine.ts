import { Decimal } from 'decimal.js';
import { UnbalancedEntriesException } from '../exceptions/unbalanced-entries.exception';

export enum EntryType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT'
}

export interface ProposedEntry {
  ledgerAccountId: string;
  entryType: EntryType;
  amount: Decimal;
  currency: string;
  description: string;
  referenceType?: string;
  referenceId?: string;
}

function groupBy<T, K extends keyof any>(list: T[], getKey: (item: T) => K) {
  return list.reduce((previous, currentItem) => {
    const group = getKey(currentItem);
    if (!previous[group]) previous[group] = [];
    previous[group].push(currentItem);
    return previous;
  }, {} as Record<K, T[]>);
}

export class DoubleEntryEngine {
  validate(entries: ProposedEntry[]): void {
    if (!entries || entries.length < 2) {
      throw new UnbalancedEntriesException('0', '0');
    }

    // Negative amount check
    for (const entry of entries) {
      if (entry.amount.lessThanOrEqualTo(0)) {
        throw new Error(`Ledger entries must have an amount greater than 0. Received: ${entry.amount.toString()}`);
      }
    }

    // Per-account currency check
    const byAccount = groupBy(entries, e => e.ledgerAccountId);
    for (const [accountId, accountEntries] of Object.entries(byAccount)) {
      const currencies = new Set(accountEntries.map(e => e.currency));
      if (currencies.size > 1) {
        throw new Error(`Mixed currencies posted to a single account: ${accountId}`);
      }
    }

    // Balance check per currency/overall
    const currencies = new Set(entries.map(e => e.currency));
    if (currencies.size === 1) {
      const currency = Array.from(currencies)[0];
      const debits = entries
        .filter(e => e.entryType === EntryType.DEBIT)
        .reduce((sum, e) => sum.plus(e.amount), new Decimal(0));
      const credits = entries
        .filter(e => e.entryType === EntryType.CREDIT)
        .reduce((sum, e) => sum.plus(e.amount), new Decimal(0));

      if (!debits.equals(credits)) {
        throw new UnbalancedEntriesException(`${debits.toFixed(4)} ${currency}`, `${credits.toFixed(4)} ${currency}`);
      }
    } else {
      const debits = entries
        .filter(e => e.entryType === EntryType.DEBIT)
        .reduce((sum, e) => sum.plus(e.amount), new Decimal(0));
      const credits = entries
        .filter(e => e.entryType === EntryType.CREDIT)
        .reduce((sum, e) => sum.plus(e.amount), new Decimal(0));

      if (!debits.equals(credits)) {
        throw new UnbalancedEntriesException(debits.toFixed(4), credits.toFixed(4));
      }
    }
  }
}
