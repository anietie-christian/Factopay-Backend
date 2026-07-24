// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable } from '@nestjs/common';

export enum TierLevel {
  BRONZE = 'BRONZE',
  SILVER = 'SILVER',
  GOLD = 'GOLD',
  PLATINUM = 'PLATINUM',
}

@Injectable()
export class TierCalculatorService {
  calculateTier(lifetimePoints: number): TierLevel {
    if (lifetimePoints >= 20000) return TierLevel.PLATINUM;
    if (lifetimePoints >= 5000) return TierLevel.GOLD;
    if (lifetimePoints >= 1000) return TierLevel.SILVER;
    return TierLevel.BRONZE;
  }

  getMultiplier(tier: TierLevel): number {
    switch (tier) {
      case TierLevel.PLATINUM:
        return 30; // 30 points per 10 EUR
      case TierLevel.GOLD:
        return 20; // 20 points per 10 EUR
      case TierLevel.SILVER:
        return 15; // 15 points per 10 EUR
      case TierLevel.BRONZE:
      default:
        return 10; // 10 points per 10 EUR
    }
  }

  calculatePointsForAmount(amount: number, tier: TierLevel): number {
    const multiplier = this.getMultiplier(tier);
    // E.g. $10 = multiplier points. So 1 EUR = multiplier / 10 points.
    // For $50 at Bronze (10 pts per 10): 50 * (10 / 10) = 50 pts
    return Math.floor(amount * (multiplier / 10));
  }
}
