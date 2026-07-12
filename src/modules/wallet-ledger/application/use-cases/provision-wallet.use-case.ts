import { Injectable, Inject } from '@nestjs/common';
import { WalletRepository } from '../../domain/ports/wallet.repository';
import { WalletType, AccountType } from '@prisma/client';

@Injectable()
export class ProvisionWalletUseCase {
  constructor(@Inject('WalletRepository') private readonly walletRepo: WalletRepository) {}

  async execute(userId: string, currency: string): Promise<void> {
    const existing = await this.walletRepo.findByUserAndCurrency(userId, currency);
    if (existing) return; // idempotent — safe to call twice

    await this.walletRepo.createWithAccount({
      userId,
      currency,
      walletType: WalletType.USER,
      account: {
        accountType: AccountType.LIABILITY, // money FactoPay owes the user
        currency,
        name: `User balance (${currency})`,
      },
    });
  }
}
