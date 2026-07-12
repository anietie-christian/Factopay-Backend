import { Test, TestingModule } from '@nestjs/testing';
import { InitiateTransferUseCase } from '../application/use-cases/initiate-transfer.use-case';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { RedisService } from '../../shared/infrastructure/cache/redis.service';
import { SubmitSettlementUseCase } from '../../blockchain-settlement/application/use-cases/submit-settlement.use-case';
import {
  FxQuoteExpiredException,
  KycNotApprovedException,
  KycLimitExceededException,
  UserNotFoundException,
} from '../../shared/domain/exceptions/factopay.exception';
import { BadRequestException } from '@nestjs/common';

describe('InitiateTransferUseCase', () => {
  let useCase: InitiateTransferUseCase;
  let mockPrisma: any;
  let mockRedis: any;
  let mockSubmitSettlementUseCase: any;

  const dto = {
    amount: '100.0000',
    currency: 'EUR',
    recipientId: 'recipient-uuid-1',
    quoteId: 'quote-uuid-1',
  };

  beforeEach(async () => {
    mockRedis = {
      get: jest.fn().mockResolvedValue(JSON.stringify({ rate: '1.1' })),
    };

    mockSubmitSettlementUseCase = {
      execute: jest.fn().mockResolvedValue({ id: 'tx-1', status: 'SUCCESS' }),
    };

    mockPrisma = {
      transfer: {
        create: jest.fn().mockResolvedValue({ id: 'transfer-uuid-1', amount: '100.0000', status: 'CREATED' }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
        update: jest.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-uuid-1',
          kycStatus: 'APPROVED',
          kycTier: 'TIER_1',
        }),
      },
      stellarWallet: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'recipient-uuid-1',
          publicKey: 'GRECIPIENTWALLET1234567890123456789012345678901234567',
        }),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(mockPrisma);
      }),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'wallet-id' }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InitiateTransferUseCase,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SubmitSettlementUseCase, useValue: mockSubmitSettlementUseCase },
      ],
    }).compile();

    useCase = module.get<InitiateTransferUseCase>(InitiateTransferUseCase);
  });

  it('should throw FxQuoteExpiredException if quote is not in Redis cache', async () => {
    mockRedis.get.mockResolvedValue(null);

    await expect(useCase.execute('user-uuid-1', dto, 'idemp-key-1')).rejects.toThrow(FxQuoteExpiredException);
  });

  it('should throw UserNotFoundException if user record does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(useCase.execute('user-uuid-1', dto, 'idemp-key-1')).rejects.toThrow(UserNotFoundException);
  });

  it('should throw KycNotApprovedException if user is not approved', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-uuid-1',
      kycStatus: 'PENDING',
      kycTier: 'TIER_1',
    });

    await expect(useCase.execute('user-uuid-1', dto, 'idemp-key-1')).rejects.toThrow(KycNotApprovedException);
  });

  it('should throw KycLimitExceededException if monthly limits are exceeded', async () => {
    mockPrisma.transfer.aggregate.mockResolvedValue({ _sum: { amount: 950 } });

    await expect(useCase.execute('user-uuid-1', dto, 'idemp-key-1')).rejects.toThrow(KycLimitExceededException);
  });

  it('should update transfer status to FAILED and throw BadRequestException if recipient does not have a provisioned Stellar wallet', async () => {
    mockPrisma.stellarWallet.findUnique.mockResolvedValue(null);

    await expect(useCase.execute('user-uuid-1', dto, 'idemp-key-1')).rejects.toThrow(BadRequestException);
    expect(mockPrisma.transfer.update).toHaveBeenCalledWith({
      where: { id: 'transfer-uuid-1' },
      data: { status: 'FAILED' },
    });
  });

  it('should successfully submit blockchain settlement and update status to COMPLETED if Horizon confirms success', async () => {
    const result = await useCase.execute('user-uuid-1', dto, 'idemp-key-1');

    expect(result.success).toBe(true);
    expect(result.status).toBe('COMPLETED');
    expect(mockSubmitSettlementUseCase.execute).toHaveBeenCalledWith({
      transferId: 'transfer-uuid-1',
      destinationPublicKey: 'GRECIPIENTWALLET1234567890123456789012345678901234567',
      amount: dto.amount,
      memo: 'FW-transfer',
      adminId: 'SYSTEM',
      ipAddress: '127.0.0.1',
    });
    expect(mockPrisma.transfer.update).toHaveBeenCalledWith({
      where: { id: 'transfer-uuid-1' },
      data: { status: 'COMPLETED' },
    });
  });

  it('should update transfer status to BLOCKCHAIN_PENDING if Horizon leaves the transaction pending verification', async () => {
    mockSubmitSettlementUseCase.execute.mockResolvedValue({ id: 'tx-1', status: 'PENDING' });

    const result = await useCase.execute('user-uuid-1', dto, 'idemp-key-1');

    expect(result.success).toBe(true);
    expect(result.status).toBe('BLOCKCHAIN_PENDING');
    expect(mockPrisma.transfer.update).toHaveBeenCalledWith({
      where: { id: 'transfer-uuid-1' },
      data: { status: 'BLOCKCHAIN_PENDING' },
    });
  });

  it('should update transfer status to FAILED and rethrow if blockchain settlement throws an error', async () => {
    mockSubmitSettlementUseCase.execute.mockRejectedValue(new Error('Horizon timeout error'));

    await expect(useCase.execute('user-uuid-1', dto, 'idemp-key-1')).rejects.toThrow('Horizon timeout error');
    expect(mockPrisma.transfer.update).toHaveBeenCalledWith({
      where: { id: 'transfer-uuid-1' },
      data: { status: 'FAILED' },
    });
  });
});
