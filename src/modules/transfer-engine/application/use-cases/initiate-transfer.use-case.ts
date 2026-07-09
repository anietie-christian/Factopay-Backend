import { Injectable } from '@nestjs/common';
import { InitiateTransferDto } from '../dtos/initiate-transfer.dto';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { RedisService } from '../../../shared/infrastructure/cache/redis.service';
import { FxQuoteExpiredException, KycNotApprovedException, KycLimitExceededException, UserNotFoundException } from '../../../shared/domain/exceptions/factopay.exception';
// Note: PrismaClient would normally be injected via the shared PrismaService
// For the scope of this step, we are mocking the dependency structure.

@Injectable()
export class InitiateTransferUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async execute(userId: string, dto: InitiateTransferDto, idempotencyKey: string) {
    // 1. Verify the FX Quote
    const quoteKey = `fx_quote:${dto.quoteId}`;
    const quoteData = await this.redisService.get(quoteKey);
    
    if (!quoteData) {
      throw new FxQuoteExpiredException();
    }

    // 2. Create the Transfer record with status CREATED
    const transfer = await this.prisma.transfer.create({
      data: {
        userId,
        amount: dto.amount,
        currency: dto.currency,
        idempotencyKey,
        status: 'CREATED',
      },
    });

    // 3. [OSCAR'S DOMAIN INJECTION POINT]
    // Verify the user is KYC approved and has enough remaining limit for this transfer
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new UserNotFoundException();
    }
    if (user.kycStatus !== 'APPROVED') {
      throw new KycNotApprovedException('User KYC is not approved.');
    }

    let monthlyLimit: number;
    switch (user.kycTier) {
      case 'TIER_1':
        monthlyLimit = 1000;
        break;
      case 'TIER_2':
        monthlyLimit = 10000;
        break;
      case 'TIER_3':
        monthlyLimit = -1; // Unlimited
        break;
      default:
        monthlyLimit = 0; // Tier 0 (NONE)
    }

    if (monthlyLimit === 0) {
      throw new KycNotApprovedException('Unverified accounts cannot perform transfers.');
    }

    if (monthlyLimit > 0) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const monthlyTransfers = await this.prisma.transfer.aggregate({
        where: {
          userId,
          status: 'COMPLETED',
          createdAt: {
            gte: startOfMonth,
          },
        },
        _sum: {
          amount: true,
        },
      });

      const totalTransferred = Number(monthlyTransfers._sum.amount || 0);
      const newTotal = totalTransferred + Number(dto.amount);
      if (newTotal > monthlyLimit) {
        throw new KycLimitExceededException(`Monthly KYC transfer limit of €${monthlyLimit} exceeded.`);
      }
    }

    // 4. Open a Prisma $transaction
    await this.prisma.$transaction(async (tx) => {
      // 5. CRITICAL: Execute a raw pessimistic lock on the user's wallet
      await tx.$queryRaw`SELECT * FROM "wallets" WHERE "user_id" = ${userId}::uuid FOR UPDATE`;

      // 6. [MR. SAMUEL'S DOMAIN INJECTION POINT]
      // Here we will call the WalletLedgerModule to safely debit the user.
      // e.g. await this.ledgerService.postDebit(userId, dto.amount, dto.currency);

      // 7. Update the Transfer status to WALLET_DEBITED
      await tx.transfer.update({
        where: { id: transfer.id },
        data: { status: 'WALLET_DEBITED' },
      });
    });

    return { success: true, transferId: transfer.id };
  }
}
