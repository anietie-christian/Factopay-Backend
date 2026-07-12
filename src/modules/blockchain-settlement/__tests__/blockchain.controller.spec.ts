import { Test, TestingModule } from '@nestjs/testing';
import { BlockchainController } from '../infrastructure/controllers/blockchain.controller';
import { SubmitSettlementUseCase } from '../application/use-cases/submit-settlement.use-case';
import { VerifySettlementUseCase } from '../application/use-cases/verify-settlement.use-case';
import { MintTestUsdcUseCase } from '../application/use-cases/mint-test-usdc.use-case';
import { GetBlockchainTransactionUseCase } from '../application/use-cases/get-blockchain-transaction.use-case';
import { CreateStellarAccountUseCase } from '../application/use-cases/create-stellar-account.use-case';
import { ListBlockchainTransactionsUseCase } from '../application/use-cases/list-blockchain-transactions.use-case';
import { ListStellarWalletsUseCase } from '../application/use-cases/list-stellar-wallets.use-case';
import { STELLAR_GATEWAY_TOKEN, StellarWalletRole } from '../domain/gateways/stellar-gateway.interface';
import { BadRequestException } from '@nestjs/common';

describe('BlockchainController', () => {
  let controller: BlockchainController;

  let mockSubmitUseCase: any;
  let mockVerifyUseCase: any;
  let mockMintUseCase: any;
  let mockGetTxUseCase: any;
  let mockCreateAccountUseCase: any;
  let mockListTxsUseCase: any;
  let mockListWalletsUseCase: any;
  let mockGateway: any;

  beforeEach(async () => {
    mockSubmitUseCase = {
      execute: jest.fn().mockResolvedValue({ id: 'tx-1', status: 'SUCCESS' }),
    };
    mockVerifyUseCase = {
      execute: jest.fn().mockResolvedValue({ id: 'tx-1', status: 'SUCCESS' }),
    };
    mockMintUseCase = {
      execute: jest.fn().mockResolvedValue({ txHash: 'mint-hash', ledger: 12 }),
    };
    mockGetTxUseCase = {
      execute: jest.fn().mockResolvedValue({ id: 'tx-1', status: 'SUCCESS' }),
    };
    mockCreateAccountUseCase = {
      execute: jest.fn().mockResolvedValue({ publicKey: 'GNEWWALLET123' }),
    };
    mockListTxsUseCase = {
      execute: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    };
    mockListWalletsUseCase = {
      execute: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    };
    mockGateway = {
      getPublicKeyForRole: jest.fn().mockReturnValue('GMASTERPUBLICKEY'),
      getAccountInfo: jest.fn().mockResolvedValue({
        publicKey: 'GMASTERPUBLICKEY',
        xlmBalance: '100',
        usdcBalance: '500',
        sequenceNumber: '12',
        trustlinesCount: 2,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BlockchainController],
      providers: [
        { provide: SubmitSettlementUseCase, useValue: mockSubmitUseCase },
        { provide: VerifySettlementUseCase, useValue: mockVerifyUseCase },
        { provide: MintTestUsdcUseCase, useValue: mockMintUseCase },
        { provide: GetBlockchainTransactionUseCase, useValue: mockGetTxUseCase },
        { provide: CreateStellarAccountUseCase, useValue: mockCreateAccountUseCase },
        { provide: ListBlockchainTransactionsUseCase, useValue: mockListTxsUseCase },
        { provide: ListStellarWalletsUseCase, useValue: mockListWalletsUseCase },
        { provide: STELLAR_GATEWAY_TOKEN, useValue: mockGateway },
      ],
    }).compile();

    controller = module.get<BlockchainController>(BlockchainController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('sendSettlement', () => {
    it('should invoke SubmitSettlementUseCase with DTO values', async () => {
      const dto = {
        transferId: 'transfer-uuid-123',
        destinationPublicKey: 'GBBD47IF6LWK7P7TZS2ADQDPTO2DMTM26IE6XYVJ65P3ENW6CIH2WCNR',
        amount: '200.5000',
        memo: 'FW-12345',
      };
      const req = { user: { id: 'admin-1' } };

      const res = await controller.sendSettlement(dto as any, req, '192.168.1.1');

      expect(res).toEqual({ id: 'tx-1', status: 'SUCCESS' });
      expect(mockSubmitUseCase.execute).toHaveBeenCalledWith({
        transferId: dto.transferId,
        destinationPublicKey: dto.destinationPublicKey,
        amount: dto.amount,
        memo: dto.memo,
        adminId: 'admin-1',
        ipAddress: '192.168.1.1',
      });
    });
  });

  describe('getTransaction', () => {
    it('should invoke GetBlockchainTransactionUseCase', async () => {
      const res = await controller.getTransaction('tx-1');
      expect(res).toEqual({ id: 'tx-1', status: 'SUCCESS' });
      expect(mockGetTxUseCase.execute).toHaveBeenCalledWith('tx-1');
    });
  });

  describe('verifyTransaction', () => {
    it('should invoke VerifySettlementUseCase', async () => {
      const res = await controller.verifyTransaction('tx-1');
      expect(res).toEqual({ id: 'tx-1', status: 'SUCCESS' });
      expect(mockVerifyUseCase.execute).toHaveBeenCalledWith('tx-1');
    });
  });

  describe('mintTestUsdc', () => {
    it('should invoke MintTestUsdcUseCase', async () => {
      const dto = {
        destinationPublicKey: 'GBBD47IF6LWK7P7TZS2ADQDPTO2DMTM26IE6XYVJ65P3ENW6CIH2WCNR',
        amount: '1000.0000',
      };
      const res = await controller.mintTestUsdc(dto as any);
      expect(res).toEqual({ txHash: 'mint-hash', ledger: 12 });
      expect(mockMintUseCase.execute).toHaveBeenCalledWith(dto.destinationPublicKey, dto.amount);
    });
  });

  describe('provisionWallet', () => {
    it('should invoke CreateStellarAccountUseCase with userId', async () => {
      const dto = { userId: 'user-uuid-123' };
      const res = await controller.provisionWallet(dto as any);

      expect(res).toEqual({ publicKey: 'GNEWWALLET123' });
      expect(mockCreateAccountUseCase.execute).toHaveBeenCalledWith('user-uuid-123');
    });
  });

  describe('checkWalletHealth', () => {
    it('should load account info for a valid wallet role', async () => {
      const res = await controller.checkWalletHealth('master');
      expect(res).toEqual({
        role: StellarWalletRole.MASTER,
        publicKey: 'GMASTERPUBLICKEY',
        xlmBalance: '100',
        usdcBalance: '500',
        sequenceNumber: '12',
        trustlinesCount: 2,
        configured: true,
      });
      expect(mockGateway.getPublicKeyForRole).toHaveBeenCalledWith(StellarWalletRole.MASTER);
      expect(mockGateway.getAccountInfo).toHaveBeenCalledWith('GMASTERPUBLICKEY');
    });

    it('should throw BadRequestException for an invalid role', async () => {
      await expect(controller.checkWalletHealth('invalid-role')).rejects.toThrow(BadRequestException);
    });
  });

  describe('listTransactions', () => {
    it('should invoke ListBlockchainTransactionsUseCase with query payload', async () => {
      const query = { status: 'SUCCESS', page: 1, limit: 10 };
      const res = await controller.listTransactions(query);
      expect(res).toEqual({ data: [], meta: {} });
      expect(mockListTxsUseCase.execute).toHaveBeenCalledWith(query);
    });
  });

  describe('listWallets', () => {
    it('should invoke ListStellarWalletsUseCase with query payload', async () => {
      const query = { isActive: true, page: 1, limit: 10 };
      const res = await controller.listWallets(query);
      expect(res).toEqual({ data: [], meta: {} });
      expect(mockListWalletsUseCase.execute).toHaveBeenCalledWith(query);
    });
  });
});
