// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { v4 as uuid } from 'uuid';

/**
 * Diagnostic test for Blockchain Settlement Limits: isolate whether
 * concurrent requests can bypass the daily limit by reading the total 
 * before any PENDING transactions are inserted.
 */
describe('Blockchain Settlement Concurrency Diagnostic', () => {
  // Use DIRECT_URL (bypasses pgbouncer) for the diagnostic
  const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: directUrl } },
    });
    await prisma.$connect();
  }, 30000);

  afterAll(async () => {
    // Cleanup the seeded transactions
    await prisma.blockchainTransaction.deleteMany({
      where: {
        sourceAddress: 'MASTER_TEST_CONCURRENCY',
      }
    });
    await prisma.$disconnect();
  });

  it('5 concurrent blockchain settlement limit checks should use pg_advisory_xact_lock to prevent bypassing limits', async () => {
    const masterWalletPublicKey = 'MASTER_TEST_CONCURRENCY';
    const maxDailyLimit = new Decimal(100000);
    
    // Create one successful baseline transaction of 99,000 to leave only 1,000 in the limit
    await prisma.blockchainTransaction.create({
      data: {
        transferId: uuid(),
        sourceAddress: masterWalletPublicKey,
        destAddress: 'G_RECEIVER',
        amount: new Decimal(99000),
        status: 'SUCCESS',
        memo: 'Baseline'
      }
    });

    // We fire 5 concurrent requests, each trying to settle 500.
    // If they bypass the lock, all 5 might see 99,000 as the total, and all 5 pass (total = 101,500 > 100,000)
    // With the advisory lock, only 2 should pass (99,000 + 500 + 500 = 100,000). The other 3 should fail.
    
    const start = Date.now();
    const tasks = Array(5).fill(0).map((_, i) => {
      const txId = uuid();
      const amount = new Decimal(500);

      return prisma.$transaction(async (tx) => {
        // Lock to serialize execution for limits
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(847293)`;
        
        // Emulate checkLimits query
        const startOfUtcDay = new Date();
        startOfUtcDay.setUTCHours(0, 0, 0, 0);
        const endOfUtcDay = new Date();
        endOfUtcDay.setUTCHours(23, 59, 59, 999);

        const dailyTransactions = await tx.blockchainTransaction.findMany({
          where: {
            status: { in: ['SUCCESS', 'PENDING', 'PENDING_VERIFICATION'] },
            sourceAddress: masterWalletPublicKey,
            createdAt: { gte: startOfUtcDay, lte: endOfUtcDay },
          },
          select: { amount: true },
        });

        let currentOutflow = new Decimal(0);
        for (const record of dailyTransactions) {
          currentOutflow = currentOutflow.plus(record.amount);
        }

        const projectedOutflow = currentOutflow.plus(amount);
        if (projectedOutflow.greaterThan(maxDailyLimit)) {
          throw new Error(`Outflow limit checks failed: Projected ${projectedOutflow} exceeds ${maxDailyLimit}`);
        }

        // Pass limits, insert PENDING
        await tx.blockchainTransaction.create({
          data: {
            transferId: txId,
            sourceAddress: masterWalletPublicKey,
            destAddress: 'G_RECEIVER',
            amount: amount,
            status: 'PENDING',
            memo: 'Concurrent tx',
          }
        });

        return `Transfer ${i} succeeded`;
      }, { maxWait: 10000, timeout: 10000 });
    });

    const results = await Promise.allSettled(tasks);
    const elapsed = Date.now() - start;

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    console.log(`\n=== BLOCKCHAIN CONCURRENCY RESULTS (${elapsed}ms) ===`);
    console.log(`Fulfilled: ${fulfilled.length}`);
    console.log(`Rejected: ${rejected.length}`);
    for (const r of rejected) {
      console.log(`  Rejection: ${(r as any).reason?.message?.substring(0, 80)}`);
    }

    // Since baseline is 99,000, we can add exactly two 500 amounts. The other 3 must reject!
    expect(fulfilled.length).toBe(2);
    expect(rejected.length).toBe(3);
  }, 15000);
});
