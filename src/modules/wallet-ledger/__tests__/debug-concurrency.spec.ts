import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { v4 as uuid } from 'uuid';

/**
 * Diagnostic test: isolate whether the concurrency timeout is caused by:
 * 1. Neon cold-start latency
 * 2. pgbouncer breaking interactive transaction locks
 * 3. Prisma connection pool exhaustion
 * 4. Neon's serverless compute suspending between queries
 */
describe('Concurrency Diagnostic', () => {
  // Use DIRECT_URL (bypasses pgbouncer) for the diagnostic
  const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: directUrl } },
    });
    await prisma.$connect();
    console.log('Connected to:', directUrl?.replace(/:[^:@]+@/, ':***@'));
  }, 30000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('single interactive transaction with FOR UPDATE should complete in <2s', async () => {
    const userId = uuid();

    // Create a wallet and account
    const wallet = await prisma.wallet.create({
      data: {
        user_id: userId,
        currency: 'EUR',
        wallet_type: 'USER',
        accounts: {
          create: { account_type: 'ASSET', currency: 'EUR', name: 'Main EUR' },
        },
      },
      include: { accounts: true },
    });

    const start = Date.now();
    await prisma.$transaction(async (tx) => {
      // Lock the wallet row
      await tx.$queryRaw`SELECT * FROM wallets WHERE id = ${wallet.id}::uuid FOR UPDATE`;

      // Sum balances
      const creditResult = await tx.ledgerEntry.aggregate({
        where: { ledger_account_id: wallet.accounts[0].id, entry_type: 'CREDIT' },
        _sum: { amount: true },
      });
      const debitResult = await tx.ledgerEntry.aggregate({
        where: { ledger_account_id: wallet.accounts[0].id, entry_type: 'DEBIT' },
        _sum: { amount: true },
      });

      console.log('Credits:', creditResult._sum.amount, 'Debits:', debitResult._sum.amount);
    }, { maxWait: 5000, timeout: 5000 });

    const elapsed = Date.now() - start;
    console.log(`Single transaction took ${elapsed}ms`);
    expect(elapsed).toBeLessThan(10000);
  }, 15000);

  it('5 concurrent interactive transactions should complete in <20s total', async () => {
    const userId = uuid();
    const systemId = uuid();

    // Create wallets
    const userWallet = await prisma.wallet.create({
      data: {
        user_id: userId, currency: 'EUR', wallet_type: 'USER',
        accounts: { create: { account_type: 'ASSET', currency: 'EUR', name: 'User EUR' } },
      },
      include: { accounts: true },
    });
    const systemWallet = await prisma.wallet.create({
      data: {
        user_id: systemId, currency: 'EUR', wallet_type: 'SETTLEMENT',
        accounts: { create: { account_type: 'ASSET', currency: 'EUR', name: 'System EUR' } },
      },
      include: { accounts: true },
    });

    const userAccountId = userWallet.accounts[0].id;
    const systemAccountId = systemWallet.accounts[0].id;

    // Seed: system gets 1000, user gets 150
    await prisma.ledgerEntry.createMany({
      data: [
        { transaction_id: uuid(), ledger_account_id: systemAccountId, entry_type: 'CREDIT', amount: new Decimal(1000), currency: 'EUR', description: 'System Init' },
        { transaction_id: uuid(), ledger_account_id: userAccountId, entry_type: 'CREDIT', amount: new Decimal(150), currency: 'EUR', description: 'User Seed' },
      ],
    });

    // Fire 5 concurrent transfers of 100 EUR
    const start = Date.now();
    const tasks = Array(5).fill(0).map((_, i) => {
      const txId = uuid();
      return prisma.$transaction(async (tx) => {
        // Lock wallets in sorted order
        const sortedIds = [userWallet.id, systemWallet.id].sort();
        for (const wid of sortedIds) {
          await tx.$queryRaw`SELECT * FROM wallets WHERE id = ${wid}::uuid FOR UPDATE`;
        }

        // Check user balance
        const creditResult = await tx.ledgerEntry.aggregate({
          where: { ledger_account_id: userAccountId, entry_type: 'CREDIT' },
          _sum: { amount: true },
        });
        const debitResult = await tx.ledgerEntry.aggregate({
          where: { ledger_account_id: userAccountId, entry_type: 'DEBIT' },
          _sum: { amount: true },
        });
        const credits = creditResult._sum.amount ? new Decimal(creditResult._sum.amount as any) : new Decimal(0);
        const debits = debitResult._sum.amount ? new Decimal(debitResult._sum.amount as any) : new Decimal(0);
        const balance = credits.minus(debits);

        if (balance.lessThan(100)) {
          throw new Error(`Insufficient balance: ${balance.toFixed(4)} < 100`);
        }

        // Insert debit + credit
        await tx.ledgerEntry.createMany({
          data: [
            { transaction_id: txId, ledger_account_id: userAccountId, entry_type: 'DEBIT', amount: new Decimal(100), currency: 'EUR', description: `Transfer ${i}` },
            { transaction_id: txId, ledger_account_id: systemAccountId, entry_type: 'CREDIT', amount: new Decimal(100), currency: 'EUR', description: `Transfer offset ${i}` },
          ],
        });
        return `Transfer ${i} succeeded`;
      }, { maxWait: 5000, timeout: 5000 });
    });

    const results = await Promise.allSettled(tasks);
    const elapsed = Date.now() - start;

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    console.log(`\n=== CONCURRENCY RESULTS (${elapsed}ms) ===`);
    console.log(`Fulfilled: ${fulfilled.length}`);
    console.log(`Rejected: ${rejected.length}`);
    for (const r of rejected) {
      console.log(`  Rejection: ${(r as any).reason?.message?.substring(0, 80)}`);
    }

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(4);
    expect(elapsed).toBeLessThan(20000);
  }, 30000);
});
