// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../modules/shared/infrastructure/database/prisma.service';
import { TierCalculatorService, TierLevel } from '../services/tier-calculator.service';
import { PointsReason } from '../../domain/enums/points-reason.enum';
import Decimal from 'decimal.js';

export interface TransferEventPayload {
  transferId: string;
  userId: string;
  amount: string;
  currency: string;
  recipientId: string;
}

@Injectable()
export class CreditTransferPointsUseCase {
  private readonly logger = new Logger(CreditTransferPointsUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tierCalculator: TierCalculatorService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('transfer.completed')
  async handleTransferCompleted(payload: TransferEventPayload) {
    this.logger.log(`Crediting points for transfer: ${payload.transferId}`);

    try {
      // 1. Ensure user has a points account
      let account = await this.prisma.pointsAccount.findUnique({
        where: { userId: payload.userId },
      });

      if (!account) {
        account = await this.prisma.pointsAccount.create({
          data: { userId: payload.userId },
        });
      }

      // 2. Calculate lifetime points to determine current tier
      const lifetimePointsResult = await this.prisma.pointsEntry.aggregate({
        where: {
          accountId: account.id,
          reason: { in: [PointsReason.TRANSFER_EARNED, PointsReason.REFERRAL_BONUS] },
        },
        _sum: { amount: true },
      });

      const currentLifetimePoints = lifetimePointsResult._sum.amount || 0;
      const currentTier = this.tierCalculator.calculateTier(currentLifetimePoints);

      // 3. Calculate points to award
      const numericAmount = new Decimal(payload.amount).toNumber();
      const pointsToAward = this.tierCalculator.calculatePointsForAmount(numericAmount, currentTier);

      if (pointsToAward <= 0) {
        this.logger.log(`Transfer ${payload.transferId} resulted in 0 points`);
        return;
      }

      // 4. Insert new points entry
      await this.prisma.pointsEntry.create({
        data: {
          accountId: account.id,
          amount: pointsToAward,
          reason: PointsReason.TRANSFER_EARNED,
          referenceId: payload.transferId,
        },
      });

      // 5. Check if this caused a tier upgrade
      const newLifetimePoints = currentLifetimePoints + pointsToAward;
      const newTier = this.tierCalculator.calculateTier(newLifetimePoints);

      if (newTier !== currentTier) {
        this.logger.log(`User ${payload.userId} upgraded to ${newTier}`);
        this.eventEmitter.emit('tier.upgraded', {
          userId: payload.userId,
          oldTier: currentTier,
          newTier: newTier,
        });
      }

    } catch (error) {
      // A points failure should not crash the main transfer process (already completed)
      // so we just log it and do not re-throw.
      this.logger.error(`Failed to credit points for transfer ${payload.transferId}`, error);
    }
  }
}
