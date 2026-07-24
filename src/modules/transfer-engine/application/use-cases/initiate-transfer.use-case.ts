// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InitiateTransferDto } from '../dtos/initiate-transfer.dto';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { RedisService } from '../../../shared/infrastructure/cache/redis.service';
import { FxQuoteExpiredException, KycNotApprovedException, KycLimitExceededException, UserNotFoundException } from '../../../shared/domain/exceptions/factopay.exception';
import { SubmitSettlementUseCase } from '../../../blockchain-settlement/application/use-cases/submit-settlement.use-case';
import { PostLedgerTransactionUseCase } from '../../../wallet-ledger/application/use-cases/post-ledger-transaction.use-case';
import { ReverseLedgerTransactionUseCase } from '../../../wallet-ledger/application/use-cases/reverse-ledger-transaction.use-case';
import { EntryType, ProposedEntry } from '../../../wallet-ledger/domain/services/double-entry.engine';
import { Decimal } from 'decimal.js';

@Injectable()
export class InitiateTransferUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly submitSettlementUseCase: SubmitSettlementUseCase,
    private readonly postLedgerTransactionUseCase: PostLedgerTransactionUseCase,
    private readonly reverseLedgerTransactionUseCase: ReverseLedgerTransactionUseCase,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(userId: string, dto: InitiateTransferDto, idempotencyKey: string) {
    // 1. Verify the FX Quote
    const quoteKey = `fx_quote:${dto.quoteId}`;
    const quoteData = await this.redisService.get(quoteKey);
    
    if (!quoteData) {
      throw new FxQuoteExpiredException();
    }

    const parsedQuote = JSON.parse(quoteData);
    const targetCurrency = parsedQuote.targetCurrency;
    const rate = new Decimal(parsedQuote.rate);
    const feePercentage = new Decimal(parsedQuote.feePercentage || 1.5);
    const sourceAmount = new Decimal(dto.amount);
    const targetAmount = sourceAmount.mul(rate);
    const feeAmount = sourceAmount.mul(feePercentage).div(100);

    // 2. Create the Transfer record with status CREATED
    const transfer = await this.prisma.transfer.create({
      data: {
        userId,
        amount: dto.amount,
        sourceCurrency: dto.currency,
        targetCurrency: targetCurrency,
        feeAmount: feeAmount.toNumber(),
        corridor: `${dto.currency}-${targetCurrency}`,
        idempotencyKey,
        status: 'CREATED',
      },
    });

    await this.prisma.transferEvent.create({
      data: {
        transferId: transfer.id,
        status: 'CREATED',
        metadata: { message: 'Transfer initiated' },
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

    // 4. Check Wallets for internal ledger
    const senderWallet = await this.prisma.wallet.findUnique({
      where: { user_id_currency: { user_id: userId, currency: dto.currency } },
      include: { accounts: true },
    });
    const recipientLedgerWallet = await this.prisma.wallet.findUnique({
      where: { user_id_currency: { user_id: dto.recipientId, currency: targetCurrency } },
      include: { accounts: true },
    });

    if (!senderWallet || !senderWallet.accounts[0]) {
      throw new BadRequestException(`Sender wallet for ${dto.currency} not found`);
    }
    if (!recipientLedgerWallet || !recipientLedgerWallet.accounts[0]) {
      throw new BadRequestException(`Recipient wallet for ${targetCurrency} not found`);
    }

    const senderAccountId = senderWallet.accounts[0].id;
    const recipientAccountId = recipientLedgerWallet.accounts[0].id;

    // 6. Build balanced entries
    const entries: ProposedEntry[] = [];
    
    if (dto.currency === targetCurrency) {
      entries.push({
        ledgerAccountId: senderAccountId,
        entryType: EntryType.DEBIT,
        amount: sourceAmount,
        currency: dto.currency,
        description: `Transfer to ${dto.recipientId}`,
        referenceType: 'TRANSFER',
        referenceId: transfer.id,
      });
      entries.push({
        ledgerAccountId: recipientAccountId,
        entryType: EntryType.CREDIT,
        amount: targetAmount,
        currency: targetCurrency,
        description: `Transfer from ${userId}`,
        referenceType: 'TRANSFER',
        referenceId: transfer.id,
      });
    } else {
      // Cross-currency transfer requires routing through FX Liquidity accounts
      const sourceFxWallet = await this.prisma.wallet.findFirst({
        where: { currency: dto.currency, wallet_type: 'LIQUIDITY' },
        include: { accounts: true }
      });
      const targetFxWallet = await this.prisma.wallet.findFirst({
        where: { currency: targetCurrency, wallet_type: 'LIQUIDITY' },
        include: { accounts: true }
      });

      if (!sourceFxWallet || !sourceFxWallet.accounts[0]) {
        throw new BadRequestException(`System FX Liquidity wallet for ${dto.currency} not found`);
      }
      if (!targetFxWallet || !targetFxWallet.accounts[0]) {
        throw new BadRequestException(`System FX Liquidity wallet for ${targetCurrency} not found`);
      }

      // Leg 1: User debited, FX Source credited (balances the source currency)
      entries.push({
        ledgerAccountId: senderAccountId,
        entryType: EntryType.DEBIT,
        amount: sourceAmount,
        currency: dto.currency,
        description: `Transfer to ${dto.recipientId} (FX Leg 1)`,
        referenceType: 'TRANSFER',
        referenceId: transfer.id,
      });
      entries.push({
        ledgerAccountId: sourceFxWallet.accounts[0].id,
        entryType: EntryType.CREDIT,
        amount: sourceAmount,
        currency: dto.currency,
        description: `FX Clearing Source for ${transfer.id}`,
        referenceType: 'TRANSFER',
        referenceId: transfer.id,
      });

      // Leg 2: FX Target debited, Recipient credited (balances the target currency)
      entries.push({
        ledgerAccountId: targetFxWallet.accounts[0].id,
        entryType: EntryType.DEBIT,
        amount: targetAmount,
        currency: targetCurrency,
        description: `FX Clearing Target for ${transfer.id}`,
        referenceType: 'TRANSFER',
        referenceId: transfer.id,
      });
      entries.push({
        ledgerAccountId: recipientAccountId,
        entryType: EntryType.CREDIT,
        amount: targetAmount,
        currency: targetCurrency,
        description: `Transfer from ${userId} (FX Leg 2)`,
        referenceType: 'TRANSFER',
        referenceId: transfer.id,
      });
    }

    try {
      await this.postLedgerTransactionUseCase.execute(transfer.id, entries);
    } catch (error: any) {
      await this.prisma.transfer.update({
        where: { id: transfer.id },
        data: { status: 'FAILED' },
      });
      await this.prisma.transferEvent.create({
        data: { transferId: transfer.id, status: 'FAILED', metadata: { message: 'Post ledger transaction failed', error: error.message } }
      });
      this.eventEmitter.emit('transfer.failed', {
        transferId: transfer.id,
        userId: transfer.userId,
        amount: dto.amount,
        currency: dto.currency,
        recipientId: dto.recipientId,
      });
      throw error;
    }

    // 7. Update the Transfer status to WALLET_DEBITED
    const updatedTransfer2 = await this.prisma.transfer.update({
      where: { id: transfer.id },
      data: { status: 'WALLET_DEBITED' },
    });
    await this.prisma.transferEvent.create({
      data: { transferId: transfer.id, status: 'WALLET_DEBITED', metadata: { message: 'Wallet debited' } }
    });

    // 8. Resolve recipient's Stellar public key for on-chain payout
    const recipientWallet = await this.prisma.stellarWallet.findUnique({
      where: { userId: dto.recipientId },
    });
    if (!recipientWallet) {
      // Mark as FAILED since payout destination is missing wallet configuration
      // We must reverse the ledger transaction before marking it as failed!
      await this.reverseLedgerTransactionUseCase.execute(transfer.id);
      await this.prisma.transfer.update({
        where: { id: transfer.id },
        data: { status: 'FAILED' },
      });
      await this.prisma.transferEvent.create({
        data: { transferId: transfer.id, status: 'FAILED', metadata: { message: 'Missing stellar wallet' } }
      });
      this.eventEmitter.emit('transfer.failed', {
        transferId: transfer.id,
        userId: transfer.userId,
        amount: dto.amount,
        currency: dto.currency,
        recipientId: dto.recipientId,
      });
      throw new BadRequestException('Recipient does not have a provisioned Stellar wallet');
    }

    try {
      // 9. Submit the blockchain settlement leg outside database transaction lock
      const settlement = await this.submitSettlementUseCase.execute({
        transferId: transfer.id,
        destinationPublicKey: recipientWallet.publicKey,
        amount: dto.amount,
        memo: `FW-${transfer.id.slice(0, 8)}`,
        adminId: '00000000-0000-0000-0000-000000000000',
        ipAddress: '127.0.0.1',
      });

      // 10. Update final status based on gateway confirmation
      const finalStatus = settlement.status === 'SUCCESS' ? 'COMPLETED' : 'BLOCKCHAIN_PENDING';
      const updatedTransfer4 = await this.prisma.transfer.update({
        where: { id: transfer.id },
        data: { status: finalStatus },
      });
      await this.prisma.transferEvent.create({
        data: { transferId: transfer.id, status: finalStatus, metadata: { message: 'Blockchain settlement result' } }
      });

      if (finalStatus === 'COMPLETED') {
        this.eventEmitter.emit('transfer.completed', {
          transferId: transfer.id,
          userId: transfer.userId,
          amount: dto.amount,
          currency: dto.currency,
          recipientId: dto.recipientId,
        });
      }

      return { success: true, transferId: transfer.id, status: finalStatus };
    } catch (error) {
      // Record failure state and reverse the ledger
      await this.reverseLedgerTransactionUseCase.execute(transfer.id);
      await this.prisma.transfer.update({
        where: { id: transfer.id },
        data: { status: 'FAILED' },
      });
      await this.prisma.transferEvent.create({
        data: { transferId: transfer.id, status: 'FAILED', metadata: { message: 'Settlement exception', error: error.message } }
      });
      this.eventEmitter.emit('transfer.failed', {
        transferId: transfer.id,
        userId: transfer.userId,
        amount: dto.amount,
        currency: dto.currency,
        recipientId: dto.recipientId,
      });
      throw error;
    }
  }
}
