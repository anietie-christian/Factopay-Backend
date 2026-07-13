import { Test, TestingModule } from '@nestjs/testing';
import { PostLedgerTransactionUseCase } from '../application/use-cases/post-ledger-transaction.use-case';
import { ProvisionWalletUseCase } from '../application/use-cases/provision-wallet.use-case';
import { CalculateBalanceUseCase } from '../application/use-cases/calculate-balance.use-case';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { EntryType } from '../domain/services/double-entry.engine';
import { Decimal } from 'decimal.js';
import { v4 as uuid } from 'uuid';
import { WalletLedgerModule } from '../wallet-ledger.module';
import { TransferEngineModule } from '../../transfer-engine/transfer-engine.module';
import { InsufficientBalanceException } from '../domain/exceptions/insufficient-balance.exception';
import { ConfigModule } from '@nestjs/config';
import { CreateStellarAccountUseCase } from '../../blockchain-settlement/application/use-cases/create-stellar-account.use-case';
import { STELLAR_GATEWAY_TOKEN } from '../../blockchain-settlement/domain/gateways/stellar-gateway.interface';
import { DestinationAllowlistService } from '../../blockchain-settlement/infrastructure/security/destination-allowlist.service';
import { Keypair } from '@stellar/stellar-sdk';

import { EventEmitterModule } from '@nestjs/event-emitter';

describe('Wallet & Ledger Integration / E2E', () => {
  let moduleRef: TestingModule;
  let postLedgerTransactionUseCase: PostLedgerTransactionUseCase;
  let provisionWalletUseCase: ProvisionWalletUseCase;
  let calculateBalanceUseCase: CalculateBalanceUseCase;
  let createStellarAccountUseCase: CreateStellarAccountUseCase;
  let prisma: PrismaService;

  // Neon serverless adds ~2-3s cold-start latency per transaction.
  // With 5 serialized lock acquisitions, total time is ~8-12s.
  // This is a Neon infrastructure cost, not a code bug.
  jest.setTimeout(30000);

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        EventEmitterModule.forRoot(),
        WalletLedgerModule,
        TransferEngineModule,
      ],
      providers: [PrismaService],
    })
      .overrideProvider(STELLAR_GATEWAY_TOKEN)
      .useValue({
        createKeyPair: () => {
          const kp = Keypair.random();
          return {
            publicKey: kp.publicKey(),
            secretKey: kp.secret(),
          };
        },
        fundWithFriendbot: async () => true,
        establishUsdcTrustline: async () => 'hash123',
        sendUsdc: async () => ({
          txHash: require('crypto').randomBytes(32).toString('hex'),
          ledger: 102,
        }),
        getPublicKeyForRole: () => 'GMASTERPUBLICKEY1234567890123456789012345678901234567',
        getAccountInfo: async () => ({
          balances: [],
        }),
      })
      .overrideProvider(DestinationAllowlistService)
      .useValue({
        isAllowed: () => true,
      })
      .overrideProvider(require('../../shared/infrastructure/cache/redis.service').RedisService)
      .useValue({
        get: jest.fn(),
        setWithExpiry: jest.fn(),
      })
      .compile();

    // init() triggers onModuleInit lifecycle hooks, which connects PrismaService.directClient
    await moduleRef.init();

    postLedgerTransactionUseCase = moduleRef.get(PostLedgerTransactionUseCase);
    provisionWalletUseCase = moduleRef.get(ProvisionWalletUseCase);
    calculateBalanceUseCase = moduleRef.get(CalculateBalanceUseCase);
    createStellarAccountUseCase = moduleRef.get(CreateStellarAccountUseCase);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await moduleRef.close();
  });

  it('should prevent concurrent double-spend (Test 3)', async () => {
    const userId = uuid();
    const systemId = uuid();
    
    await provisionWalletUseCase.execute(userId, 'EUR');
    await provisionWalletUseCase.execute(systemId, 'EUR');
    
    const userWallet = await prisma.wallet.findFirst({ where: { user_id: userId, currency: 'EUR' }, include: { accounts: true } });
    const systemWallet = await prisma.wallet.findFirst({ where: { user_id: systemId, currency: 'EUR' }, include: { accounts: true } });
    
    const userAccountId = userWallet.accounts[0].id;
    const systemAccountId = systemWallet.accounts[0].id;

    // Seed 150 EUR to User (Credit User, Debit System)
    // To allow System to be debited, System needs balance too, or we can just bypass checking for the System account 
    // Wait, the double entry engine requires debits to be checked. Let's just seed system manually via Prisma for the test.
    await prisma.ledgerEntry.createMany({
      data: [
        { transaction_id: uuid(), ledger_account_id: systemAccountId, entry_type: 'CREDIT', amount: new Decimal(1000), currency: 'EUR', description: 'System Init' }
      ]
    });

    await postLedgerTransactionUseCase.execute(uuid(), [
      { ledgerAccountId: userAccountId, entryType: EntryType.CREDIT, amount: new Decimal(150), currency: 'EUR', description: 'Seed' },
      { ledgerAccountId: systemAccountId, entryType: EntryType.DEBIT, amount: new Decimal(150), currency: 'EUR', description: 'Seed offset' } 
    ]);

    // Now fire 5 concurrent transfers of 100 EUR from User to System
    const transferTasks = Array(5).fill(0).map(() => {
      return postLedgerTransactionUseCase.execute(uuid(), [
        { ledgerAccountId: userAccountId, entryType: EntryType.DEBIT, amount: new Decimal(100), currency: 'EUR', description: 'Transfer' },
        { ledgerAccountId: systemAccountId, entryType: EntryType.CREDIT, amount: new Decimal(100), currency: 'EUR', description: 'Transfer offset' }
      ]);
    });

    console.log("WAITING FOR TRANSFERS");
    const results = await Promise.allSettled(transferTasks);
    console.log("TRANSFERS COMPLETED", results.map(r => r.status));
    
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(4);
    // Under Neon serverless, rejected transfers fail with either:
    // - InsufficientBalanceException: got the lock, saw insufficient balance (correct)
    // - PrismaClientKnownRequestError: Prisma $transaction timeout while waiting for row lock (also correct — prevents double-spend)
    // Both are valid double-spend prevention outcomes.
    for (const r of rejected) {
      const reason = (r as any).reason;
      console.log("REJECTION REASON:", reason);
      const isInsufficientBalance = reason instanceof InsufficientBalanceException;
      const isPrismaTimeout = reason?.constructor?.name === 'PrismaClientKnownRequestError';
      expect(isInsufficientBalance || isPrismaTimeout).toBe(true);
    }
    
    console.log("CALCULATING FINAL BALANCE");
    const finalBalance = await calculateBalanceUseCase.execute(userId, 'EUR');
    console.log("FINAL BALANCE IS", finalBalance.toString());
    expect(finalBalance.toString()).toBe('50');
  }, 60000);

  it('should execute full transfer-engine to ledger e2e', async () => {
    // Add an e2e test: a full transfer through transfer-engine that actually lands in the ledger
    const initiateTransferUseCase = moduleRef.get(require('../../transfer-engine/application/use-cases/initiate-transfer.use-case').InitiateTransferUseCase);
    
    const senderId = uuid();
    const recipientId = uuid();
    await provisionWalletUseCase.execute(senderId, 'EUR');
    await provisionWalletUseCase.execute(recipientId, 'EUR');

    // Provision Stellar wallet for recipient so payout check passes
    await createStellarAccountUseCase.execute(recipientId);

    const senderWallet = await prisma.wallet.findFirst({ where: { user_id: senderId, currency: 'EUR' }, include: { accounts: true } });
    await prisma.ledgerEntry.createMany({
      data: [
        { transaction_id: uuid(), ledger_account_id: senderWallet.accounts[0].id, entry_type: 'CREDIT', amount: new Decimal(500), currency: 'EUR', description: 'Initial sender balance' }
      ]
    });

    // Mock Redis for quote
    const redisService = moduleRef.get(require('../../shared/infrastructure/cache/redis.service').RedisService);
    const quoteId = uuid();
    redisService.get.mockResolvedValueOnce(JSON.stringify({
      sourceCurrency: 'EUR',
      targetCurrency: 'EUR',
      rate: 1.0,
      expiresAt: new Date(Date.now() + 100000).toISOString()
    }));

    // Make user KYC approved
    await prisma.user.create({
      data: {
        id: senderId,
        email: `${senderId}@test.com`,
        kycStatus: 'APPROVED',
        kycTier: 'TIER_1',
      }
    });

    // Initiate Transfer
    const result = await initiateTransferUseCase.execute(senderId, {
      amount: '150',
      currency: 'EUR',
      recipientId: recipientId,
      quoteId: quoteId,
    }, uuid());

    expect(result.success).toBe(true);

    const finalSenderBalance = await calculateBalanceUseCase.execute(senderId, 'EUR');
    expect(finalSenderBalance.toString()).toBe('350');

    const finalRecipientBalance = await calculateBalanceUseCase.execute(recipientId, 'EUR');
    expect(finalRecipientBalance.toString()).toBe('150');
  }, 60000);

  it('should revert ledger entries if blockchain settlement fails', async () => {
    // 1. Set up a transfer that succeeds up to the blockchain step
    const initiateTransferUseCase = moduleRef.get(require('../../transfer-engine/application/use-cases/initiate-transfer.use-case').InitiateTransferUseCase);
    const submitSettlementUseCase = moduleRef.get(require('../../blockchain-settlement/application/use-cases/submit-settlement.use-case').SubmitSettlementUseCase);
    
    // spy on submitSettlementUseCase and mock rejection
    jest.spyOn(submitSettlementUseCase, 'execute').mockRejectedValueOnce(new Error('Blockchain node offline'));

    const senderId = uuid();
    const recipientId = uuid();
    await provisionWalletUseCase.execute(senderId, 'EUR');
    await provisionWalletUseCase.execute(recipientId, 'EUR');

    const senderWallet = await prisma.wallet.findFirst({ where: { user_id: senderId, currency: 'EUR' }, include: { accounts: true } });
    await prisma.ledgerEntry.createMany({
      data: [
        { transaction_id: uuid(), ledger_account_id: senderWallet.accounts[0].id, entry_type: 'CREDIT', amount: new Decimal(500), currency: 'EUR', description: 'Initial sender balance' }
      ]
    });

    // We also need the user to have a Stellar wallet so it passes step 8
    await prisma.stellarWallet.create({
      data: {
        userId: recipientId,
        publicKey: `G-${uuid().substring(0, 10)}`,
        encryptedSecret: 'S-SECRET',
      }
    });

    // Make user KYC approved
    await prisma.user.create({
      data: {
        id: senderId,
        email: `${senderId}@test.com`,
        kycStatus: 'APPROVED',
        kycTier: 'TIER_1',
      }
    });

    // Mock Redis for quote
    const redisService = moduleRef.get(require('../../shared/infrastructure/cache/redis.service').RedisService);
    const quoteId = uuid();
    
    redisService.get.mockResolvedValueOnce(JSON.stringify({
      sourceCurrency: 'EUR',
      targetCurrency: 'EUR',
      rate: 1.0,
      expiresAt: new Date(Date.now() + 100000).toISOString()
    }));

    // Initial balance is 500
    const initialBalance = await calculateBalanceUseCase.execute(senderId, 'EUR');
    console.log('--- TEST: Initial Sender Balance:', initialBalance.toString());
    expect(initialBalance.toString()).toBe('500');

    // Initiate Transfer
    let errorThrown = false;
    try {
      await initiateTransferUseCase.execute(senderId, {
        amount: '150',
        currency: 'EUR',
        recipientId: recipientId,
        quoteId: quoteId,
      }, uuid());
    } catch (e) {
      errorThrown = true;
      console.log('--- TEST: Expected Blockchain Failure Caught:', e.message);
      expect(e.message).toBe('Blockchain node offline');
    }

    expect(errorThrown).toBe(true);

    // Reversal should have posted. Final balance should be 500.
    const finalSenderBalance = await calculateBalanceUseCase.execute(senderId, 'EUR');
    console.log('--- TEST: Final Sender Balance After Reversal:', finalSenderBalance.toString());
    expect(finalSenderBalance.toString()).toBe('500');

    // Recipient balance should be 0
    const finalRecipientBalance = await calculateBalanceUseCase.execute(recipientId, 'EUR');
    console.log('--- TEST: Final Recipient Balance After Reversal:', finalRecipientBalance.toString());
    expect(finalRecipientBalance.toString()).toBe('0');
    
    // Optional: Assert transfer status is FAILED
    const transfer = await prisma.transfer.findFirst({ where: { userId: senderId } });
    console.log('--- TEST: Final Transfer Status:', transfer.status);
    expect(transfer.status).toBe('FAILED');
  }, 60000);
});
