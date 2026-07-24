// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Module } from '@nestjs/common';
import { TierCalculatorService } from './application/services/tier-calculator.service';
import { PointsExpiryService } from './application/services/points-expiry.service';
import { CreditTransferPointsUseCase } from './application/use-cases/credit-transfer-points.use-case';
import { RedeemPointsUseCase } from './application/use-cases/redeem-points.use-case';

@Module({
  providers: [
    TierCalculatorService,
    PointsExpiryService,
    CreditTransferPointsUseCase,
    RedeemPointsUseCase,
  ],
  exports: [
    RedeemPointsUseCase,
    PointsExpiryService,
    TierCalculatorService,
  ],
})
export class RewardsPointsModule {}
