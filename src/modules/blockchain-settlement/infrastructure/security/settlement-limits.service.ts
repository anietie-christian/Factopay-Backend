import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { BlockchainErrorCode } from '../../domain/errors/blockchain-errors';

@Injectable()
export class SettlementLimitsService {
  private maxTxAmount: Decimal;
  private maxDailyOutflow: Decimal;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const defaultMaxTx = this.configService.get<string>('STELLAR_MAX_TX_AMOUNT', '10000.0000');
    const defaultMaxDaily = this.configService.get<string>('STELLAR_MAX_DAILY_OUTFLOW', '100000.0000');
    
    this.maxTxAmount = new Decimal(defaultMaxTx);
    this.maxDailyOutflow = new Decimal(defaultMaxDaily);
  }

  /**
   * Verifies if a transaction amount is within the allowed limits.
   */
  public async checkLimits(amount: string | number | Decimal): Promise<{
    allowed: boolean;
    reason?: BlockchainErrorCode;
    details?: string;
  }> {
    const decimalAmount = new Decimal(amount.toString());

    // 1. Check per-transaction ceiling
    if (decimalAmount.greaterThan(this.maxTxAmount)) {
      return {
        allowed: false,
        reason: BlockchainErrorCode.AMOUNT_EXCEEDS_LIMIT,
        details: `Transaction amount ${decimalAmount.toString()} USDC exceeds the maximum single transfer limit of ${this.maxTxAmount.toString()} USDC.`,
      };
    }

    // 2. Check daily aggregate outflow
    const startOfUtcDay = new Date();
    startOfUtcDay.setUTCHours(0, 0, 0, 0);

    const endOfUtcDay = new Date();
    endOfUtcDay.setUTCHours(23, 59, 59, 999);

    // Only count outflows from the MASTER settlement wallet, not ISSUER mints
    const masterPublicKey = this.configService.get<string>('STELLAR_MASTER_PUBLIC', '');

    const dailyTransactions = await this.prisma.blockchainTransaction.findMany({
      where: {
        status: 'SUCCESS',
        ...(masterPublicKey ? { sourceAddress: masterPublicKey } : {}),
        createdAt: {
          gte: startOfUtcDay,
          lte: endOfUtcDay,
        },
      },
      select: {
        amount: true,
      },
    });

    let currentOutflow = new Decimal(0);
    for (const tx of dailyTransactions) {
      currentOutflow = currentOutflow.plus(tx.amount);
    }

    const projectedOutflow = currentOutflow.plus(decimalAmount);
    if (projectedOutflow.greaterThan(this.maxDailyOutflow)) {
      return {
        allowed: false,
        reason: BlockchainErrorCode.DAILY_OUTFLOW_EXCEEDED,
        details: `Projected daily outflow ${projectedOutflow.toString()} USDC exceeds the maximum daily cap of ${this.maxDailyOutflow.toString()} USDC (Current success: ${currentOutflow.toString()} USDC).`,
      };
    }

    return { allowed: true };
  }
}
