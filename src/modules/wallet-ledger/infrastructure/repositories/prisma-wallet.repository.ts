import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { WalletRepository, PrismaTransaction, CreateWalletData } from '../../domain/ports/wallet.repository';
import { Wallet } from '@prisma/client';

@Injectable()
export class PrismaWalletRepository implements WalletRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserAndCurrency(userId: string, currency: string): Promise<Wallet | null> {
    return this.prisma.wallet.findUnique({
      where: {
        user_id_currency: {
          user_id: userId,
          currency: currency,
        },
      },
      include: {
        accounts: true,
      },
    });
  }

  async lockForUpdate(walletId: string, tx: PrismaTransaction): Promise<Wallet> {
    const result = await tx.$queryRaw<Wallet[]>`
      SELECT * FROM wallets
      WHERE id = ${walletId}::uuid
      FOR UPDATE
    `;
    if (!result || !result[0]) throw new NotFoundException(`Wallet ${walletId} not found`);
    return result[0];
  }

  async createWithAccount(data: CreateWalletData, tx?: PrismaTransaction): Promise<Wallet> {
    const db = tx || this.prisma;
    return db.wallet.create({
      data: {
        user_id: data.userId,
        currency: data.currency,
        wallet_type: data.walletType,
        accounts: {
          create: {
            account_type: data.account.accountType,
            currency: data.account.currency,
            name: data.account.name,
          },
        },
      },
      include: {
        accounts: true,
      },
    });
  }
}
