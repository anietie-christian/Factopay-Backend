import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { WalletRepository } from '../../domain/ports/wallet.repository';
import { LedgerRepository } from '../../domain/ports/ledger.repository';
import { Decimal } from 'decimal.js';

@Injectable()
export class CalculateBalanceUseCase {
  constructor(
    @Inject('WalletRepository') private readonly walletRepo: WalletRepository,
    @Inject('LedgerRepository') private readonly ledgerRepo: LedgerRepository,
  ) {}

  async execute(userId: string, currency: string): Promise<Decimal> {
    const wallet = await this.walletRepo.findByUserAndCurrency(userId, currency);
    if (!wallet) throw new NotFoundException('Wallet not found');

    // Currently Prisma relation doesn't type accounts automatically without include.
    // For this interface, we assume the wallet object has an 'accounts' array.
    const account = (wallet as any).accounts?.[0]; // one account per user wallet
    if (!account) {
      throw new NotFoundException('Ledger account not found for wallet');
    }

    const { debits, credits } = await this.ledgerRepo.sumByAccount(account.id);

    return credits.minus(debits); // Balance = Credits − Debits (liability account)
  }
}
