import { Wallet } from '@prisma/client';
import { Prisma } from '@prisma/client';

export type PrismaTransaction = Omit<
  Prisma.TransactionClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface CreateWalletData {
  userId: string;
  currency: string;
  walletType: any; // Using enum from Prisma
  account: {
    accountType: any; // Using enum from Prisma
    currency: string;
    name: string;
  };
}

export interface WalletRepository {
  findByUserAndCurrency(userId: string, currency: string): Promise<Wallet | null>;
  lockForUpdate(walletId: string, tx: PrismaTransaction): Promise<Wallet>;
  createWithAccount(data: CreateWalletData, tx?: PrismaTransaction): Promise<Wallet>;
}
