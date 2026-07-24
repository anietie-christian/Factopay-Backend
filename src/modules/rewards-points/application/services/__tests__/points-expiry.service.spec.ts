// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Test, TestingModule } from '@nestjs/testing';
import { PointsExpiryService } from '../points-expiry.service';
import { PrismaService } from '../../../../shared/infrastructure/database/prisma.service';
import { PointsReason } from '../../../domain/enums/points-reason.enum';
import { Logger } from '@nestjs/common';

describe('PointsExpiryService', () => {
  let service: PointsExpiryService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PointsExpiryService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(),
            pointsAccount: {
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<PointsExpiryService>(PointsExpiryService);
    prisma = module.get<PrismaService>(PrismaService);
    
    // Silence logger
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('expirePointsForAccount', () => {
    it('should correctly calculate and expire unused points from > 1 year ago', async () => {
      // Mock the transaction callback directly
      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'acc-123' }]),
        pointsEntry: {
          aggregate: jest.fn(),
          create: jest.fn(),
        },
      };

      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
        return cb(mockTx);
      });

      // Earned 500 points > 1 year ago
      mockTx.pointsEntry.aggregate.mockResolvedValueOnce({ _sum: { amount: 500 } });
      
      // Total used points (redeemed/expired) over ALL time: -100
      mockTx.pointsEntry.aggregate.mockResolvedValueOnce({ _sum: { amount: -100 } });

      await service.expirePointsForAccount('acc-123');

      // pointsToExpire should be Math.max(0, 500 - 100) = 400
      expect(mockTx.pointsEntry.create).toHaveBeenCalledWith({
        data: {
          accountId: 'acc-123',
          amount: -400,
          reason: PointsReason.EXPIRED,
        },
      });
    });

    it('should not expire any points if total used >= earned > 1 year ago', async () => {
      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'acc-123' }]),
        pointsEntry: {
          aggregate: jest.fn(),
          create: jest.fn(),
        },
      };

      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
        return cb(mockTx);
      });

      // Earned 500 points > 1 year ago
      mockTx.pointsEntry.aggregate.mockResolvedValueOnce({ _sum: { amount: 500 } });
      
      // Total used points over ALL time: -600 (they used more points than they earned > 1 year ago)
      mockTx.pointsEntry.aggregate.mockResolvedValueOnce({ _sum: { amount: -600 } });

      await service.expirePointsForAccount('acc-123');

      // Math.max(0, 500 - 600) = 0, should not create entry
      expect(mockTx.pointsEntry.create).not.toHaveBeenCalled();
    });
  });
});
