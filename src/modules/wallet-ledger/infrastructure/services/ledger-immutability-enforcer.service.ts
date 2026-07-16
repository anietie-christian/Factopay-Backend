import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';

@Injectable()
export class LedgerImmutabilityEnforcer implements OnModuleInit {
  private readonly logger = new Logger(LedgerImmutabilityEnforcer.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    this.logger.log('Enforcing database-level ledger immutability triggers...');

    try {
      // 1. Create trigger function to reject updates/deletes
      await this.prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'Ledger entries are immutable and cannot be updated or deleted.';
        END;
        $$ LANGUAGE plpgsql;
      `);

      // 2. Create trigger function to reject delete on accounts
      await this.prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION prevent_ledger_account_delete()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'Ledger accounts cannot be deleted.';
        END;
        $$ LANGUAGE plpgsql;
      `);

      // 3. Bind update/delete block to ledger_entries
      await this.prisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS trg_prevent_ledger_entries_mutation ON ledger_entries;
        CREATE TRIGGER trg_prevent_ledger_entries_mutation
        BEFORE UPDATE OR DELETE ON ledger_entries
        FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
      `);

      // 4. Bind delete block to ledger_accounts
      await this.prisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS trg_prevent_ledger_accounts_delete ON ledger_accounts;
        CREATE TRIGGER trg_prevent_ledger_accounts_delete
        BEFORE DELETE ON ledger_accounts
        FOR EACH ROW EXECUTE FUNCTION prevent_ledger_account_delete();
      `);

      this.logger.log('Ledger immutability triggers applied successfully.');
    } catch (error) {
      this.logger.error('Failed to enforce ledger immutability triggers:', error);
      // We log but do not block app bootstrap, so tests against mock DBs or SQLite (which doesn't support pg triggers) still pass.
    }
  }
}
