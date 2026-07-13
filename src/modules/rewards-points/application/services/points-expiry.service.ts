import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../modules/shared/infrastructure/database/prisma.service';
import { PointsReason } from '../../domain/enums/points-reason.enum';

@Injectable()
export class PointsExpiryService {
  private readonly logger = new Logger(PointsExpiryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async expirePointsForAccount(accountId: string): Promise<void> {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    await this.prisma.$transaction(async (tx) => {
      // 1. Lock the account
      const accounts = await tx.$queryRaw<any[]>`
        SELECT id FROM points_accounts 
        WHERE id = ${accountId}::uuid 
        FOR UPDATE
      `;

      if (!accounts || accounts.length === 0) return;

      // 2. Calculate Earned > 1 Year Ago
      const earnedPastResult = await tx.pointsEntry.aggregate({
        where: {
          accountId,
          createdAt: { lt: oneYearAgo },
          reason: { in: [PointsReason.TRANSFER_EARNED, PointsReason.REFERRAL_BONUS] },
        },
        _sum: { amount: true },
      });
      const earnedPast = earnedPastResult._sum.amount || 0;

      // 3. Calculate total redeemed & already expired
      const debitsResult = await tx.pointsEntry.aggregate({
        where: {
          accountId,
          reason: { in: [PointsReason.REDEEMED, PointsReason.EXPIRED] },
        },
        _sum: { amount: true },
      });
      // Debits are negative in our system, so we negate them to get the absolute used points
      const totalUsed = Math.abs(debitsResult._sum.amount || 0);

      // 4. Calculate points to expire
      const pointsToExpire = Math.max(0, earnedPast - totalUsed);

      if (pointsToExpire > 0) {
        await tx.pointsEntry.create({
          data: {
            accountId,
            amount: -pointsToExpire,
            reason: PointsReason.EXPIRED,
          },
        });
        this.logger.log(`Expired ${pointsToExpire} points for account ${accountId}`);
      }
    });
  }

  // Helper function for the system to process all accounts
  async processExpiryForAllAccounts(): Promise<void> {
    const accounts = await this.prisma.pointsAccount.findMany({ select: { id: true } });
    for (const acc of accounts) {
      await this.expirePointsForAccount(acc.id);
    }
  }
}
