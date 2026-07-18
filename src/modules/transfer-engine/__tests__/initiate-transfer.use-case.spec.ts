import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InitiateTransferUseCase } from '../application/use-cases/initiate-transfer.use-case';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { RedisService } from '../../shared/infrastructure/cache/redis.service';
import { PostLedgerTransactionUseCase } from '../../wallet-ledger/application/use-cases/post-ledger-transaction.use-case';
import { FxQuoteExpiredException, KycNotApprovedException, KycLimitExceededException, UserNotFoundException } from '../../shared/domain/exceptions/factopay.exception';
import { InsufficientBalanceException } from '../../wallet-ledger/domain/exceptions/insufficient-balance.exception';
import { SubmitSettlementUseCase } from '../../blockchain-settlement/application/use-cases/submit-settlement.use-case';
import { Decimal } from 'decimal.js';
import { ReverseLedgerTransactionUseCase } from '../../wallet-ledger/application/use-cases/reverse-ledger-transaction.use-case';

describe('InitiateTransferUseCase', () => {
  let useCase: InitiateTransferUseCase;
  let prismaService: jest.Mocked<PrismaService>;
  let redisService: jest.Mocked<RedisService>;
  let postLedgerTransactionUseCase: jest.Mocked<PostLedgerTransactionUseCase>;
  let submitSettlementUseCase: jest.Mocked<SubmitSettlementUseCase>;
  let reverseLedgerTransactionUseCase: jest.Mocked<ReverseLedgerTransactionUseCase>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InitiateTransferUseCase,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn() },
            transfer: { create: jest.fn(), aggregate: jest.fn(), update: jest.fn() },
            transferEvent: { create: jest.fn() },
            wallet: { findUnique: jest.fn(), findFirst: jest.fn() },
            systemWallet: { findFirst: jest.fn() },
            stellarWallet: { findUnique: jest.fn() },
          },
        },
        {
          provide: RedisService,
          useValue: { get: jest.fn() },
        },
        {
          provide: PostLedgerTransactionUseCase,
          useValue: { execute: jest.fn() },
        },
        {
          provide: SubmitSettlementUseCase,
          useValue: { execute: jest.fn() },
        },
        {
          provide: ReverseLedgerTransactionUseCase,
          useValue: { execute: jest.fn() },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        }
      ],
    }).compile();

    useCase = module.get<InitiateTransferUseCase>(InitiateTransferUseCase);
    prismaService = module.get(PrismaService) as any;
    redisService = module.get(RedisService) as any;
    postLedgerTransactionUseCase = module.get(PostLedgerTransactionUseCase) as any;
    submitSettlementUseCase = module.get(SubmitSettlementUseCase) as any;
    reverseLedgerTransactionUseCase = module.get(ReverseLedgerTransactionUseCase) as any;
    (prismaService.wallet.findFirst as jest.Mock).mockResolvedValue({ accounts: [{ id: 'fx-liquidity-acct-default' }] });
  });

  const validDto = {
    amount: new Decimal(100),
    currency: 'EUR',
    targetCurrency: 'USD',
    quoteId: 'valid-quote-id',
  } as any;

  const validQuote = {
    sourceCurrency: 'EUR',
    targetCurrency: 'USD',
    rate: 1.1,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };

  it('should throw FxQuoteExpiredException if quote is missing from Redis', async () => {
    redisService.get.mockResolvedValueOnce(null);
    await expect(useCase.execute('user-id', validDto, 'idempotency-key')).rejects.toThrow(FxQuoteExpiredException);
  });

  it('should throw UserNotFoundException if user does not exist', async () => {
    redisService.get.mockResolvedValueOnce(JSON.stringify(validQuote));
    (prismaService.transfer.create as jest.Mock).mockResolvedValueOnce({ id: 'transfer-123' });
    (prismaService.user.findUnique as jest.Mock).mockResolvedValueOnce(null);
    
    await expect(useCase.execute('user-id', validDto, 'idempotency-key')).rejects.toThrow(UserNotFoundException);
  });

  it('should throw KycNotApprovedException if user KYC is not APPROVED', async () => {
    redisService.get.mockResolvedValueOnce(JSON.stringify(validQuote));
    (prismaService.transfer.create as jest.Mock).mockResolvedValueOnce({ id: 'transfer-123' });
    (prismaService.user.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'user-id', kycStatus: 'PENDING', kycTier: 'TIER_1' });
    
    await expect(useCase.execute('user-id', validDto, 'idempotency-key')).rejects.toThrow(KycNotApprovedException);
  });

  it('should throw KycLimitExceededException if monthly limit is exceeded', async () => {
    redisService.get.mockResolvedValueOnce(JSON.stringify(validQuote));
    (prismaService.transfer.create as jest.Mock).mockResolvedValueOnce({ id: 'transfer-123' });
    (prismaService.user.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'user-id', kycStatus: 'APPROVED', kycTier: 'TIER_1' });
    (prismaService.transfer.aggregate as jest.Mock).mockResolvedValueOnce({ _sum: { amount: new Decimal(950) } }); // 950 + 100 > 1000 limit
    
    await expect(useCase.execute('user-id', validDto, 'idempotency-key')).rejects.toThrow(KycLimitExceededException);
  });

  it('should fail the transfer if sender wallet is missing', async () => {
    redisService.get.mockResolvedValueOnce(JSON.stringify(validQuote));
    (prismaService.transfer.create as jest.Mock).mockResolvedValueOnce({ id: 'transfer-123' });
    (prismaService.user.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'user-id', kycStatus: 'APPROVED', kycTier: 'TIER_3' });
    (prismaService.wallet.findUnique as jest.Mock).mockResolvedValueOnce(null); // Sender wallet missing
    
    await expect(useCase.execute('user-id', validDto, 'idempotency-key')).rejects.toThrow('Sender wallet for EUR not found');
  });

  it('should process a cross-currency transfer and post 4-way FX entries to ledger successfully', async () => {
    redisService.get.mockResolvedValueOnce(JSON.stringify(validQuote));
    (prismaService.transfer.create as jest.Mock).mockResolvedValueOnce({ id: 'transfer-123' });
    (prismaService.user.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'user-id', kycStatus: 'APPROVED', kycTier: 'TIER_3' });
    
    (prismaService.wallet.findUnique as jest.Mock)
      .mockResolvedValueOnce({ accounts: [{ id: 'sender-acct-1' }] }) // Sender wallet
      .mockResolvedValueOnce({ accounts: [{ id: 'recipient-acct-1' }] }); // Recipient wallet
      
    (prismaService.wallet.findFirst as jest.Mock)
      .mockResolvedValueOnce({ accounts: [{ id: 'fx-source-acct-1' }] }) // FX Source (EUR)
      .mockResolvedValueOnce({ accounts: [{ id: 'fx-target-acct-1' }] }); // FX Target (USD)

    (prismaService.stellarWallet.findUnique as jest.Mock).mockResolvedValueOnce({ publicKey: 'G-RECIPIENT' });
      
    postLedgerTransactionUseCase.execute.mockResolvedValueOnce(undefined);
    (prismaService.stellarWallet.findUnique as jest.Mock).mockResolvedValueOnce({ publicKey: 'GDESTINATION123' });
    submitSettlementUseCase.execute.mockResolvedValueOnce({ status: 'SUCCESS' } as any);
    
    // We also need to mock submitSettlementUseCase since it proceeds after ledger
    submitSettlementUseCase.execute.mockResolvedValueOnce({ status: 'SUCCESS' } as any);

    await useCase.execute('user-id', validDto, 'idempotency-key');
    
    expect(postLedgerTransactionUseCase.execute).toHaveBeenCalled();
    const entries = postLedgerTransactionUseCase.execute.mock.calls[0][1];
    
    expect(entries).toHaveLength(4);
    
    // Leg 1: Source Currency (EUR)
    expect(entries[0].amount.toString()).toBe('100'); 
    expect(entries[0].currency).toBe('EUR');
    expect(entries[0].entryType).toBe('DEBIT');
    expect(entries[0].ledgerAccountId).toBe('sender-acct-1');

    expect(entries[1].amount.toString()).toBe('100'); 
    expect(entries[1].currency).toBe('EUR');
    expect(entries[1].entryType).toBe('CREDIT');
    expect(entries[1].ledgerAccountId).toBe('fx-source-acct-1');

    // Leg 2: Target Currency (USD)
    expect(entries[2].amount.toString()).toBe('110'); // Converted amount (100 * 1.1)
    expect(entries[2].currency).toBe('USD');
    expect(entries[2].entryType).toBe('DEBIT');
    expect(entries[2].ledgerAccountId).toBe('fx-target-acct-1');

    expect(entries[3].amount.toString()).toBe('110'); 
    expect(entries[3].currency).toBe('USD');
    expect(entries[3].entryType).toBe('CREDIT');
    expect(entries[3].ledgerAccountId).toBe('recipient-acct-1');
    
    expect(prismaService.transfer.update).toHaveBeenCalledWith({
      where: { id: 'transfer-123' },
      data: { status: 'COMPLETED' },
    });
  });

  it('should mark transfer as FAILED if InsufficientBalanceException is thrown by Ledger', async () => {
    redisService.get.mockResolvedValueOnce(JSON.stringify(validQuote));
    (prismaService.transfer.create as jest.Mock).mockResolvedValueOnce({ id: 'transfer-123' });
    (prismaService.user.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'user-id', kycStatus: 'APPROVED', kycTier: 'TIER_3' });
    
    (prismaService.wallet.findUnique as jest.Mock)
      .mockResolvedValueOnce({ accounts: [{ id: 'sender-acct-1' }] }) 
      .mockResolvedValueOnce({ accounts: [{ id: 'system-acct-1' }] });
      
    postLedgerTransactionUseCase.execute.mockRejectedValueOnce(new InsufficientBalanceException('0', '100', 'EUR'));
    
    await expect(useCase.execute('user-id', validDto, 'idempotency-key')).rejects.toThrow(InsufficientBalanceException);
    
    expect(prismaService.transfer.update).toHaveBeenCalledWith({
      where: { id: 'transfer-123' },
      data: { status: 'FAILED' },
    });
  });

  it('should throw Error if recipient wallet is missing', async () => {
    redisService.get.mockResolvedValueOnce(JSON.stringify(validQuote));
    (prismaService.transfer.create as jest.Mock).mockResolvedValueOnce({ id: 'transfer-123' });
    (prismaService.user.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'user-id', kycStatus: 'APPROVED', kycTier: 'TIER_3' });
    
    (prismaService.wallet.findUnique as jest.Mock)
      .mockResolvedValueOnce({ accounts: [{ id: 'sender-acct-1' }] }) 
      .mockResolvedValueOnce(null); // Recipient wallet missing
      
    await expect(useCase.execute('user-id', validDto, 'idempotency-key')).rejects.toThrow('Recipient wallet for USD not found');
  });

  it('should allow transfer for TIER_2 if within limit', async () => {
    redisService.get.mockResolvedValueOnce(JSON.stringify(validQuote));
    (prismaService.transfer.create as jest.Mock).mockResolvedValueOnce({ id: 'transfer-123' });
    (prismaService.user.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'user-id', kycStatus: 'APPROVED', kycTier: 'TIER_2' });
    (prismaService.transfer.aggregate as jest.Mock).mockResolvedValueOnce({ _sum: { amount: new Decimal(100) } }); // 100 + 100 < 10000 limit
    
    (prismaService.wallet.findUnique as jest.Mock)
      .mockResolvedValueOnce({ accounts: [{ id: 'sender-acct-1' }] }) 
      .mockResolvedValueOnce({ accounts: [{ id: 'system-acct-1' }] });
      
    postLedgerTransactionUseCase.execute.mockResolvedValueOnce(undefined);
    (prismaService.stellarWallet.findUnique as jest.Mock).mockResolvedValueOnce({ publicKey: 'GDESTINATION123' });
    submitSettlementUseCase.execute.mockResolvedValueOnce({ status: 'SUCCESS' } as any);
    
    await expect(useCase.execute('user-id', validDto, 'idempotency-key')).resolves.toEqual({ success: true, transferId: 'transfer-123', status: 'COMPLETED' });
  });

  it('should mark transfer as FAILED if UnbalancedEntriesException is thrown by Ledger', async () => {
    redisService.get.mockResolvedValueOnce(JSON.stringify(validQuote));
    (prismaService.transfer.create as jest.Mock).mockResolvedValueOnce({ id: 'transfer-123' });
    (prismaService.user.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'user-id', kycStatus: 'APPROVED', kycTier: 'TIER_3' });
    
    (prismaService.wallet.findUnique as jest.Mock)
      .mockResolvedValueOnce({ accounts: [{ id: 'sender-acct-1' }] }) 
      .mockResolvedValueOnce({ accounts: [{ id: 'system-acct-1' }] });
      
    // Import this exception at the top! We will mock it by just rejecting with an error that has the right name.
    const unbalancedError = new Error('Unbalanced');
    unbalancedError.name = 'UnbalancedEntriesException';
    Object.setPrototypeOf(unbalancedError, require('../../wallet-ledger/domain/exceptions/unbalanced-entries.exception').UnbalancedEntriesException.prototype);
    postLedgerTransactionUseCase.execute.mockRejectedValueOnce(unbalancedError);
    
    await expect(useCase.execute('user-id', validDto, 'idempotency-key')).rejects.toThrow('Unbalanced');
    
    expect(prismaService.transfer.update).toHaveBeenCalledWith({
      where: { id: 'transfer-123' },
      data: { status: 'FAILED' },
    });
  });
});
