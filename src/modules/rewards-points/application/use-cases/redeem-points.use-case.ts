import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../modules/shared/infrastructure/database/prisma.service';
import { PointsReason } from '../../domain/enums/points-reason.enum';

@Injectable()
export class RedeemPointsUseCase {
  private readonly logger = new Logger(RedeemPointsUseCase.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string, pointsToRedeem: number): Promise<{ success: boolean, giftCardCode?: string }> {
    if (pointsToRedeem !== 500) {
      throw new BadRequestException('Currently, only redemptions of exactly 500 points ($5 Gift Card) are supported.');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Lock the PointsAccount using raw query for SELECT ... FOR UPDATE
      const accounts = await tx.$queryRaw<any[]>`
        SELECT id FROM points_accounts 
        WHERE user_id = ${userId}::uuid 
        FOR UPDATE
      `;

      if (!accounts || accounts.length === 0) {
        throw new BadRequestException('Points account not found.');
      }
      const accountId = accounts[0].id;

      // 2. Calculate available balance
      const balanceResult = await tx.pointsEntry.aggregate({
        where: { accountId },
        _sum: { amount: true },
      });

      const currentBalance = balanceResult._sum.amount || 0;

      // 3. Check sufficiency
      if (currentBalance < pointsToRedeem) {
        throw new BadRequestException(`Insufficient points. You need ${pointsToRedeem} but have ${currentBalance}.`);
      }

      // 4. Create REDEEMED entry (negative amount)
      await tx.pointsEntry.create({
        data: {
          accountId,
          amount: -pointsToRedeem,
          reason: PointsReason.REDEEMED,
        },
      });

      this.logger.log(`User ${userId} redeemed ${pointsToRedeem} points.`);

      // 5. Mock fulfillment
      const mockGiftCard = `AMZ-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

      return { success: true, giftCardCode: mockGiftCard };
    });
  }
}
