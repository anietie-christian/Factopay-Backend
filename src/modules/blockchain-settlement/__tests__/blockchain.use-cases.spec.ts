import { Test, TestingModule } from '@nestjs/testing';
import { CreateStellarAccountUseCase } from '../application/use-cases/create-stellar-account.use-case';
import { SubmitSettlementUseCase } from '../application/use-cases/submit-settlement.use-case';
import { VerifySettlementUseCase } from '../application/use-cases/verify-settlement.use-case';
import { MintTestUsdcUseCase } from '../application/use-cases/mint-test-usdc.use-case';
import { GetBlockchainTransactionUseCase } from '../application/use-cases/get-blockchain-transaction.use-case';
import { ListBlockchainTransactionsUseCase } from '../application/use-cases/list-blockchain-transactions.use-case';
import { ListStellarWalletsUseCase } from '../application/use-cases/list-stellar-wallets.use-case';
import { STELLAR_GATEWAY_TOKEN, StellarWalletRole } from '../domain/gateways/stellar-gateway.interface';
import { BLOCKCHAIN_REPOSITORY_TOKEN } from '../domain/repositories/blockchain-repository.interface';
import { DestinationAllowlistService } from '../infrastructure/security/destination-allowlist.service';
import { SettlementLimitsService } from '../infrastructure/security/settlement-limits.service';
import { AdminAuditService } from '../../shared/infrastructure/services/admin-audit.service';
import { MemoResolver } from '../domain/models/memo-resolver';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { BlockchainErrorCode } from '../domain/errors/blockchain-errors';

describe('Blockchain Settlement Use Cases', () => {
  let createAccountUseCase: CreateStellarAccountUseCase;
  let submitSettlementUseCase: SubmitSettlementUseCase;
  let verifySettlementUseCase: VerifySettlementUseCase;
  let mintTestUsdcUseCase: MintTestUsdcUseCase;
  let getTxUseCase: GetBlockchainTransactionUseCase;
  let listTxsUseCase: ListBlockchainTransactionsUseCase;
  let listWalletsUseCase: ListStellarWalletsUseCase;

  let mockGateway: any;
  let mockRepository: any;
  let mockAllowlist: any;
  let mockLimits: any;
  let mockAdminAuditService: any;
  let mockConfigService: any;
  let mockPrisma: any;

  const defaultConfigMap: Record<string, string> = {
    STELLAR_WALLET_ENCRYPTION_KEY: 'testkeypassphrase123',
    STELLAR_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
    STELLAR_USDC_ISSUER_PUBLIC: 'GISSUER',
    STELLAR_MASTER_PUBLIC: 'GMASTERPUBLICKEY1234567890123456789012345678901234567',
  };

  beforeEach(async () => {
    mockGateway = {
      createKeyPair: jest.fn().mockReturnValue({
        publicKey: 'GUSERWALLET123456789012345678901234567890123456789012345',
        secretKey: 'SUSERSECRET123456789012345678901234567890123456789012345',
      }),
      fundWithFriendbot: jest.fn().mockResolvedValue(true),
      establishUsdcTrustline: jest.fn().mockResolvedValue('hash123'),
      mintUsdc: jest.fn().mockResolvedValue({
        txHash: 'minthash123',
        ledger: 101,
      }),
      sendUsdc: jest.fn().mockResolvedValue({
        txHash: 'sendhash123',
        ledger: 102,
      }),
      verifyTransaction: jest.fn(),
      getPublicKeyForRole: jest.fn().mockReturnValue('GMASTERPUBLICKEY1234567890123456789012345678901234567'),
    };

    mockRepository = {
      findWalletByUserId: jest.fn(),
      createStellarWallet: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'w1', ...data })),
      updateWalletTrustline: jest.fn(),
      findTransactionByTransferId: jest.fn(),
      findTransactionById: jest.fn(),
      createTransaction: jest.fn().mockImplementation((data) => Promise.resolve({ id: 't1', ...data, createdAt: new Date() })),
      updateTransactionStatus: jest.fn().mockImplementation((id, data) => Promise.resolve({ id, ...data, createdAt: new Date() })),
      findManyTransactions: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findManyWallets: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    };

    mockAllowlist = {
      isAllowed: jest.fn().mockReturnValue(true),
    };

    mockLimits = {
      checkLimits: jest.fn().mockResolvedValue({ allowed: true }),
    };

    mockAdminAuditService = {
      log: jest.fn().mockResolvedValue(true),
    };

    mockConfigService = {
      get: jest.fn((key: string, defaultVal?: any) => {
        return defaultConfigMap[key] !== undefined ? defaultConfigMap[key] : defaultVal;
      }),
    };

    mockPrisma = {
      blockchainTransaction: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const memoResolver = new MemoResolver([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateStellarAccountUseCase,
        SubmitSettlementUseCase,
        VerifySettlementUseCase,
        MintTestUsdcUseCase,
        GetBlockchainTransactionUseCase,
        ListBlockchainTransactionsUseCase,
        ListStellarWalletsUseCase,
        { provide: STELLAR_GATEWAY_TOKEN, useValue: mockGateway },
        { provide: BLOCKCHAIN_REPOSITORY_TOKEN, useValue: mockRepository },
        { provide: DestinationAllowlistService, useValue: mockAllowlist },
        { provide: SettlementLimitsService, useValue: mockLimits },
        { provide: AdminAuditService, useValue: mockAdminAuditService },
        { provide: MemoResolver, useValue: memoResolver },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    createAccountUseCase = module.get<CreateStellarAccountUseCase>(CreateStellarAccountUseCase);
    submitSettlementUseCase = module.get<SubmitSettlementUseCase>(SubmitSettlementUseCase);
    verifySettlementUseCase = module.get<VerifySettlementUseCase>(VerifySettlementUseCase);
    mintTestUsdcUseCase = module.get<MintTestUsdcUseCase>(MintTestUsdcUseCase);
    getTxUseCase = module.get<GetBlockchainTransactionUseCase>(GetBlockchainTransactionUseCase);
    listTxsUseCase = module.get<ListBlockchainTransactionsUseCase>(ListBlockchainTransactionsUseCase);
    listWalletsUseCase = module.get<ListStellarWalletsUseCase>(ListStellarWalletsUseCase);
  });

  describe('CreateStellarAccountUseCase', () => {
    it('should provision a new custodial wallet successfully', async () => {
      mockRepository.findWalletByUserId.mockResolvedValue(null);

      const result = await createAccountUseCase.execute('user-uuid-1');

      expect(result.publicKey).toBe('GUSERWALLET123456789012345678901234567890123456789012345');
      expect(mockGateway.createKeyPair).toHaveBeenCalled();
      expect(mockGateway.fundWithFriendbot).toHaveBeenCalled();
      expect(mockGateway.establishUsdcTrustline).toHaveBeenCalled();
      expect(mockRepository.createStellarWallet).toHaveBeenCalled();
      expect(mockRepository.updateWalletTrustline).toHaveBeenCalledWith('user-uuid-1', true);
    });

    it('should be idempotent and return existing wallet if already provisioned', async () => {
      mockRepository.findWalletByUserId.mockResolvedValue({
        publicKey: 'GEXISTINGPUBLICKEY',
      });

      const result = await createAccountUseCase.execute('user-uuid-1');

      expect(result.publicKey).toBe('GEXISTINGPUBLICKEY');
      expect(mockGateway.createKeyPair).not.toHaveBeenCalled();
    });
  });

  describe('SubmitSettlementUseCase', () => {
    const params = {
      transferId: 't-uuid-1',
      destinationPublicKey: 'GDESTINATION12345678901234567890123456789012345678901234',
      amount: '500.0000',
      memo: 'FW-t-uuid-1',
      adminId: 'admin-uuid-1',
      ipAddress: '127.0.0.1',
    };

    it('should successfully submit a settlement and log audit trail', async () => {
      mockRepository.findTransactionByTransferId.mockResolvedValue(null);

      const result = await submitSettlementUseCase.execute(params);

      expect(result.status).toBe('SUCCESS');
      expect(mockGateway.sendUsdc).toHaveBeenCalledWith({
        senderRole: StellarWalletRole.MASTER,
        destinationPublicKey: params.destinationPublicKey,
        amount: params.amount,
        memo: params.memo,
      });
      expect(mockAdminAuditService.log).toHaveBeenCalledWith(
        'admin-uuid-1',
        'BLOCKCHAIN_SETTLEMENT_SUBMITTED',
        'TRANSFER',
        params.transferId,
        expect.any(Object),
        '127.0.0.1',
      );
    });

    it('should auto-generate memo via MemoResolver when memo is not provided', async () => {
      mockRepository.findTransactionByTransferId.mockResolvedValue(null);

      const paramsWithoutMemo = {
        transferId: 't-uuid-2',
        destinationPublicKey: 'GDESTINATION12345678901234567890123456789012345678901234',
        amount: '100.0000',
        adminId: 'admin-uuid-1',
        ipAddress: '127.0.0.1',
      };

      await submitSettlementUseCase.execute(paramsWithoutMemo);

      // MemoResolver with empty anchors falls back to raw transferId
      expect(mockGateway.sendUsdc).toHaveBeenCalledWith(
        expect.objectContaining({
          memo: 't-uuid-2',
        }),
      );
    });

    it('should reject transaction if address is not allowlisted', async () => {
      mockAllowlist.isAllowed.mockReturnValue(false);

      await expect(submitSettlementUseCase.execute(params)).rejects.toThrow(
        expect.objectContaining({
          code: BlockchainErrorCode.DESTINATION_NOT_ALLOWLISTED,
        }),
      );
    });

    it('should reject transaction if limits are exceeded', async () => {
      mockLimits.checkLimits.mockResolvedValue({
        allowed: false,
        reason: 'AMOUNT_EXCEEDS_LIMIT',
      });

      await expect(submitSettlementUseCase.execute(params)).rejects.toThrow(
        expect.objectContaining({
          code: BlockchainErrorCode.AMOUNT_EXCEEDS_LIMIT,
        }),
      );
    });
  });

  describe('VerifySettlementUseCase', () => {
    it('should update state to SUCCESS when verified on Horizon', async () => {
      mockRepository.findTransactionById.mockResolvedValue({
        id: 't-db-id',
        status: 'PENDING',
        txHash: 'hash123',
        createdAt: new Date(),
      });

      mockGateway.verifyTransaction.mockResolvedValue({
        exists: true,
        successful: true,
        ledger: 500,
      });

      const result = await verifySettlementUseCase.execute('t-db-id');

      expect(result.status).toBe('SUCCESS');
      expect(mockRepository.updateTransactionStatus).toHaveBeenCalledWith('t-db-id', {
        status: 'SUCCESS',
        ledger: 500,
      });
    });
  });

  describe('MintTestUsdcUseCase', () => {
    it('should reject mint if network mode is MAINNET', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'STELLAR_NETWORK_PASSPHRASE') return 'Public Global Stellar Network ; October 2015';
        // Use default config map for other keys (no recursive call)
        return defaultConfigMap[key] !== undefined ? defaultConfigMap[key] : defaultValue;
      });

      await expect(mintTestUsdcUseCase.execute('GDEST', '100')).rejects.toThrow(
        expect.objectContaining({
          code: BlockchainErrorCode.MINT_DISABLED_MAINNET,
        }),
      );
    });
  });

  describe('ListBlockchainTransactionsUseCase', () => {
    it('should load transactions page cleanly', async () => {
      mockRepository.findManyTransactions.mockResolvedValue({
        data: [{ id: 'tx-1', status: 'SUCCESS' }],
        total: 1,
      });

      const result = await listTxsUseCase.execute({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.totalItems).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe('ListStellarWalletsUseCase', () => {
    it('should sanitize encryptedSecret from the response list', async () => {
      mockRepository.findManyWallets.mockResolvedValue({
        data: [{ id: 'w-1', publicKey: 'GPUBLICKEY', encryptedSecret: 'enc-secret' }],
        total: 1,
      });

      const result = await listWalletsUseCase.execute({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].publicKey).toBe('GPUBLICKEY');
      expect((result.data[0] as any).encryptedSecret).toBeUndefined();
      expect((result.data[0] as any).hasEncryptedSecret).toBe(true);
    });
  });
});
