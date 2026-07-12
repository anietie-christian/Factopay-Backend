import { Injectable } from '@nestjs/common';
import { InitiateTransferDto } from '../dtos/initiate-transfer.dto';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { RedisService } from '../../../shared/infrastructure/cache/redis.service';
import { FxQuoteExpiredException, KycNotApprovedException, KycLimitExceededException, UserNotFoundException } from '../../../shared/domain/exceptions/factopay.exception';
import { PostLedgerTransactionUseCase } from '../../../wallet-ledger/application/use-cases/post-ledger-transaction.use-case';
import { EntryType, ProposedEntry } from '../../../wallet-ledger/domain/services/double-entry.engine';
import { InsufficientBalanceException } from '../../../wallet-ledger/domain/exceptions/insufficient-balance.exception';
import { UnbalancedEntriesException } from '../../../wallet-ledger/domain/exceptions/unbalanced-entries.exception';
import { Decimal } from 'decimal.js';
import { Logger } from '@nestjs/common';

@Injectable()
export class InitiateTransferUseCase {
  private readonly logger = new Logger(InitiateTransferUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly postLedgerTransactionUseCase: PostLedgerTransactionUseCase,
  ) {}

  async execute(userId: string, dto: InitiateTransferDto, idempotencyKey: string) {
    const start = Date.now();
    const log = (msg) => console.log(`[${Date.now() - start}ms] ${msg}`);

    // 1. Verify the FX Quote
    const quoteKey = `fx_quote:${dto.quoteId}`;
    const quoteData = await this.redisService.get(quoteKey);
    
    if (!quoteData) {
      throw new FxQuoteExpiredException();
    }
    log('Redis fetched');

    const parsedQuote = JSON.parse(quoteData);
    const targetCurrency = parsedQuote.targetCurrency;
    const rate = new Decimal(parsedQuote.rate);
    const sourceAmount = new Decimal(dto.amount);
    const targetAmount = sourceAmount.mul(rate);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // 2-4. Execute independent validation queries in parallel
    const [user, monthlyTransfers, senderWallet, recipientWallet] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
      }),
      this.prisma.transfer.aggregate({
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
      }),
      this.prisma.wallet.findUnique({
        where: { user_id_currency: { user_id: userId, currency: dto.currency } },
        include: { accounts: true },
      }),
      this.prisma.wallet.findUnique({
        where: { user_id_currency: { user_id: dto.recipientId, currency: targetCurrency } },
        include: { accounts: true },
      }),
    ]);
    log('Parallel queries finished (user, limits, wallets)');

    // 3. [OSCAR'S DOMAIN INJECTION POINT]
    // Verify the user is KYC approved and has enough remaining limit for this transfer
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
      const totalTransferred = Number(monthlyTransfers._sum.amount || 0);
      const newTotal = totalTransferred + Number(dto.amount);
      if (newTotal > monthlyLimit) {
        throw new KycLimitExceededException(`Monthly KYC transfer limit of €${monthlyLimit} exceeded.`);
      }
    }
    log('KYC Checked');

    // Check Wallets
    if (!senderWallet || !senderWallet.accounts[0]) {
      throw new Error(`Sender wallet for ${dto.currency} not found`);
    }
    if (!recipientWallet || !recipientWallet.accounts[0]) {
      throw new Error(`Recipient wallet for ${targetCurrency} not found`);
    }

    const senderAccountId = senderWallet.accounts[0].id;
    const recipientAccountId = recipientWallet.accounts[0].id;

    // 5. Create the Transfer record with status CREATED (only after validation passes)
    const transfer = await this.prisma.transfer.create({
      data: {
        userId,
        amount: dto.amount,
        currency: dto.currency,
        idempotencyKey,
        status: 'CREATED',
      },
    });
    log('Transfer created in DB');

    // 6. Build balanced entries
    const entries: ProposedEntry[] = [
      {
        ledgerAccountId: senderAccountId,
        entryType: EntryType.DEBIT,
        amount: sourceAmount,
        currency: dto.currency,
        description: `Transfer to ${dto.recipientId}`,
        referenceType: 'TRANSFER',
        referenceId: transfer.id,
      },
      {
        ledgerAccountId: recipientAccountId,
        entryType: EntryType.CREDIT,
        amount: targetAmount,
        currency: targetCurrency,
        description: `Transfer from ${userId}`,
        referenceType: 'TRANSFER',
        referenceId: transfer.id,
      }
    ];

    // 7. Call PostLedgerTransactionUseCase
    try {
      await this.postLedgerTransactionUseCase.execute(transfer.id, entries);
    } catch (error) {
      if (error instanceof InsufficientBalanceException) {
        await this.prisma.transfer.update({
          where: { id: transfer.id },
          data: { status: 'FAILED' },
        });
        throw error;
      } else if (error instanceof UnbalancedEntriesException) {
        this.logger.error(`CRITICAL: Unbalanced entries detected for transfer ${transfer.id}`, error.stack);
        await this.prisma.transfer.update({
          where: { id: transfer.id },
          data: { status: 'FAILED' },
        });
        throw error;
      }
      throw error;
    }
    log('Ledger posted');

    // 8. Update the Transfer status to COMPLETED
    await this.prisma.transfer.update({
      where: { id: transfer.id },
      data: { status: 'COMPLETED' },
    });
    log('Transfer marked completed');

    return { success: true, transferId: transfer.id };
  }
}
