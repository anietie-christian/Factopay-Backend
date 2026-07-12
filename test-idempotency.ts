import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { PostLedgerTransactionUseCase } from './src/modules/wallet-ledger/application/use-cases/post-ledger-transaction.use-case';
import { PrismaService } from './src/modules/shared/infrastructure/database/prisma.service';
import { EntryType } from './src/modules/wallet-ledger/domain/services/double-entry.engine';
import { Decimal } from 'decimal.js';
import { v4 as uuid } from 'uuid';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const useCase = app.get(PostLedgerTransactionUseCase);

  // 1. Create dummy wallets for the test
  const user1 = await prisma.user.create({
    data: { email: `test-${uuid()}@example.com`, passwordHash: 'hash', role: 'USER' }
  });
  const user2 = await prisma.user.create({
    data: { email: `test-${uuid()}@example.com`, passwordHash: 'hash', role: 'USER' }
  });
  
  const w1 = await prisma.wallet.create({
    data: { user_id: user1.id, currency: 'EUR', wallet_type: 'USER' }
  });
  const w2 = await prisma.wallet.create({
    data: { user_id: user2.id, currency: 'EUR', wallet_type: 'USER' }
  });

  const a1 = await prisma.ledgerAccount.create({
    data: { wallet_id: w1.id, account_type: 'LIABILITY', currency: 'EUR', name: 'w1' }
  });
  const a2 = await prisma.ledgerAccount.create({
    data: { wallet_id: w2.id, account_type: 'LIABILITY', currency: 'EUR', name: 'w2' }
  });

  // Seed balance to w1
  await prisma.ledgerEntry.createMany({
    data: [
      { transaction_id: uuid(), ledger_account_id: a1.id, entry_type: 'CREDIT', amount: 500, currency: 'EUR', description: 'seed' },
      { transaction_id: uuid(), ledger_account_id: a2.id, entry_type: 'DEBIT', amount: 500, currency: 'EUR', description: 'seed offset' }
    ]
  });

  console.log("Seeding complete. Starting concurrent transaction test.");
  
  const transactionId = uuid();
  const entries = [
    { ledgerAccountId: a1.id, entryType: EntryType.DEBIT, amount: new Decimal(10), currency: 'EUR', description: 'Idempotency test' },
    { ledgerAccountId: a2.id, entryType: EntryType.CREDIT, amount: new Decimal(10), currency: 'EUR', description: 'Idempotency test' },
  ];

  // Fire 5 concurrent requests with the EXACT same transactionId and entries
  console.log(`Firing 5 requests with transactionId: ${transactionId}`);
  const tasks = Array(5).fill(0).map(() => useCase.execute(transactionId, entries));
  
  const results = await Promise.allSettled(tasks);
  
  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    if (res.status === 'rejected') {
      console.error(`Task ${i} REJECTED with reason:`, res.reason);
    }
  }
  
  // Count the number of entries actually in the database for this transactionId
  const dbEntries = await prisma.ledgerEntry.findMany({
    where: { transaction_id: transactionId }
  });

  console.log("Concurrent tasks finished.");
  console.log(`Total database entries for tx ${transactionId}: ${dbEntries.length}`);
  console.log("Expected: 2 (one debit, one credit)");

  if (dbEntries.length !== 2) {
    console.error("IDEMPOTENCY FAILED!");
    process.exit(1);
  } else {
    console.log("IDEMPOTENCY SUCCESS! Only one request inserted entries. The rest safely no-oped.");
  }

  await app.close();
}
bootstrap();
