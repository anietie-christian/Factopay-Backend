import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../modules/shared/infrastructure/database/prisma.service';
import { SharedModule } from '../../../modules/shared/shared.module';
import { RewardsPointsModule } from '../rewards-points.module';
import { CreditTransferPointsUseCase } from '../application/use-cases/credit-transfer-points.use-case';
import { RedeemPointsUseCase } from '../application/use-cases/redeem-points.use-case';
import { TierCalculatorService, TierLevel } from '../application/services/tier-calculator.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PointsReason } from '../domain/enums/points-reason.enum';
import { v4 as uuidv4 } from 'uuid';
import { BadRequestException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

jest.setTimeout(30000);

describe('Rewards Engine (Integration)', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let creditPointsUseCase: CreditTransferPointsUseCase;
  let redeemPointsUseCase: RedeemPointsUseCase;
  let eventEmitter: EventEmitter2;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [() => ({})] }),
        EventEmitterModule.forRoot(),
        SharedModule, 
        RewardsPointsModule
      ],
      providers: [],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    creditPointsUseCase = module.get<CreditTransferPointsUseCase>(CreditTransferPointsUseCase);
    redeemPointsUseCase = module.get<RedeemPointsUseCase>(RedeemPointsUseCase);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  async function createTestUser(): Promise<string> {
    const user = await prisma.user.create({
      data: { email: `rewards_test_${uuidv4()}@example.com` },
    });
    return user.id;
  }

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (module) {
      await module.close();
    }
  });

  it('should credit points on transfer and upgrade tier', async () => {
    const userId = await createTestUser();
    const emitSpy = jest.spyOn(eventEmitter, 'emit');

    const payload1 = {
      transferId: uuidv4(),
      userId: userId,
      amount: '50', // 50 EUR
      currency: 'EUR',
      recipientId: uuidv4(),
    };

    await creditPointsUseCase.handleTransferCompleted(payload1);

    // Initial tier is Bronze, so multiplier is 10 points per 10 EUR => 50 points
    let account = await prisma.pointsAccount.findUnique({
      where: { userId: userId },
      include: { entries: true },
    });

    expect(account).toBeDefined();
    expect(account!.entries.length).toBe(1);
    expect(account!.entries[0].amount).toBe(50);
    expect(account!.entries[0].reason).toBe(PointsReason.TRANSFER_EARNED);

    // Bronze doesn't upgrade to bronze
    expect(emitSpy).not.toHaveBeenCalledWith('tier.upgraded', expect.any(Object));

    // Force enough points for Silver (1000)
    // Needs 950 more points. Bronze rate is 10 per 10 EUR, so 1 point per 1 EUR.
    const payload2 = {
      transferId: uuidv4(),
      userId: userId,
      amount: '950',
      currency: 'EUR',
      recipientId: uuidv4(),
    };

    await creditPointsUseCase.handleTransferCompleted(payload2);

    expect(emitSpy).toHaveBeenCalledWith('tier.upgraded', {
      userId: userId,
      oldTier: TierLevel.BRONZE,
      newTier: TierLevel.SILVER,
    });
    
    emitSpy.mockRestore();
  });

  it('should reject over-redemption', async () => {
    const userId = await createTestUser();
    // Add 1000 points manually to ensure enough points for the first two redemptions
    let account = await prisma.pointsAccount.findUnique({ where: { userId } });
    if (!account) {
      account = await prisma.pointsAccount.create({ data: { userId } });
    }
    await prisma.pointsEntry.create({
      data: {
        accountId: account.id,
        amount: 1000,
        reason: PointsReason.TRANSFER_EARNED,
      }
    });

    const result = await redeemPointsUseCase.execute(userId, 500);
    expect(result.success).toBe(true);
    expect(result.giftCardCode).toBeDefined();

    // Now balance is 500. Redeem another 500.
    const result2 = await redeemPointsUseCase.execute(userId, 500);
    expect(result2.success).toBe(true);

    // Balance is 0. Redeem again, should fail.
    await expect(redeemPointsUseCase.execute(userId, 500)).rejects.toThrow(BadRequestException);
  });

  it('should prevent double-redemption via concurrency locks', async () => {
    const userId = await createTestUser();
    // Add 500 points to user
    let account = await prisma.pointsAccount.findUnique({ where: { userId } });
    if (!account) {
      account = await prisma.pointsAccount.create({ data: { userId } });
    }
    await prisma.pointsEntry.create({
      data: {
        accountId: account.id,
        amount: 500,
        reason: PointsReason.TRANSFER_EARNED,
      },
    });

    // Simulate 5 concurrent attempts to redeem 500 points
    const attempts = Array.from({ length: 5 }).map(() =>
      redeemPointsUseCase.execute(userId, 500)
    );

    const results = await Promise.allSettled(attempts);

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    // Exactly 1 should succeed
    expect(successes.length).toBe(1);
    // 4 should fail due to insufficient points
    expect(failures.length).toBe(4);
    
    // Validate final balance is 0
    const finalBalanceResult = await prisma.pointsEntry.aggregate({
      where: { accountId: account.id },
      _sum: { amount: true },
    });
    expect(finalBalanceResult._sum.amount).toBe(0);
  });
});
