import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { PrismaService } from './src/modules/shared/infrastructure/database/prisma.service';
import { PostLedgerTransactionUseCase } from './src/modules/wallet-ledger/application/use-cases/post-ledger-transaction.use-case';
import { ReverseLedgerTransactionUseCase } from './src/modules/wallet-ledger/application/use-cases/reverse-ledger-transaction.use-case';
import { ProvisionWalletUseCase } from './src/modules/wallet-ledger/application/use-cases/provision-wallet.use-case';
import { EntryType } from './src/modules/wallet-ledger/domain/services/double-entry.engine';
import { Decimal } from 'decimal.js';
import { v4 as uuid } from 'uuid';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const provision = app.get(ProvisionWalletUseCase);
  const postLedger = app.get(PostLedgerTransactionUseCase);
  const reverseLedger = app.get(ReverseLedgerTransactionUseCase);

  const senderId = uuid();
  const recipientId = uuid();

  await provision.execute(senderId, 'EUR');
  await provision.execute(recipientId, 'EUR');

  const senderWallet = await prisma.wallet.findFirst({ where: { user_id: senderId, currency: 'EUR' }, include: { accounts: true } });
  const recipientWallet = await prisma.wallet.findFirst({ where: { user_id: recipientId, currency: 'EUR' }, include: { accounts: true } });

  const senderAccountId = senderWallet.accounts[0].id;
  const recipientAccountId = recipientWallet.accounts[0].id;

  // Give sender 1000 EUR
  await prisma.ledgerEntry.createMany({
    data: [
      { transaction_id: uuid(), ledger_account_id: senderAccountId, entry_type: 'CREDIT', amount: new Decimal(1000), currency: 'EUR', description: 'Init' }
    ]
  });

  const txId = uuid();
  
  // Post original transaction
  console.log('--- POSTING ORIGINAL TRANSACTION ---');
  await postLedger.execute(txId, [
    { ledgerAccountId: senderAccountId, entryType: EntryType.DEBIT, amount: new Decimal(100), currency: 'EUR', description: 'Transfer' },
    { ledgerAccountId: recipientAccountId, entryType: EntryType.CREDIT, amount: new Decimal(100), currency: 'EUR', description: 'Receive' }
  ]);
  
  const originalEntriesCount = await prisma.ledgerEntry.count({ where: { transaction_id: txId } });
  console.log(`Original transaction created with ${originalEntriesCount} entries.`);

  console.log('--- EXECUTING REVERSAL MULTIPLE TIMES CONCURRENTLY ---');
  // Fire 5 concurrent reversals
  const tasks = Array(5).fill(0).map(() => reverseLedger.execute(txId));
  
  const results = await Promise.allSettled(tasks);
  
  const fulfilled = results.filter(r => r.status === 'fulfilled');
  const rejected = results.filter(r => r.status === 'rejected');
  
  console.log(`Concurrent Reversals: ${fulfilled.length} Succeeded, ${rejected.length} Rejected (due to lock/timeout)`);
  
  // Verify the reversal was only applied once by checking the DB
  const { v5: uuidv5 } = require('uuid');
  const REVERSAL_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
  const reversalTxId = uuidv5(`${txId}-rev`, REVERSAL_NAMESPACE);
  
  const reversalEntries = await prisma.ledgerEntry.findMany({ where: { transaction_id: reversalTxId } });
  console.log(`Total reversal entries created in DB: ${reversalEntries.length} (Expected: 2)`);

  if (reversalEntries.length > 2) {
      console.log('FAIL: Idempotency was violated. Multiple reversals applied.');
  } else {
      console.log('SUCCESS: Reversal Idempotency works perfectly.');
  }

  await app.close();
}

bootstrap().catch(err => {
  console.error(err);
  process.exit(1);
});
