import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { BlockchainTransaction, StellarWallet, Prisma } from '@prisma/client';
import { IBlockchainRepository } from '../../domain/repositories/blockchain-repository.interface';

@Injectable()
export class PrismaBlockchainRepository implements IBlockchainRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ----------------------------------------
  // BlockchainTransaction Operations
  // ----------------------------------------

  async createTransaction(data: {
    transferId: string;
    sourceAddress: string;
    destAddress: string;
    amount: Prisma.Decimal | number | string;
    memo?: string;
    status: string;
  }): Promise<BlockchainTransaction> {
    return this.prisma.blockchainTransaction.create({
      data: {
        transferId: data.transferId,
        sourceAddress: data.sourceAddress,
        destAddress: data.destAddress,
        amount: data.amount,
        memo: data.memo,
        status: data.status,
      },
    });
  }

  async findTransactionById(id: string): Promise<BlockchainTransaction | null> {
    return this.prisma.blockchainTransaction.findUnique({
      where: { id },
    });
  }

  async findTransactionByTransferId(transferId: string): Promise<BlockchainTransaction | null> {
    return this.prisma.blockchainTransaction.findUnique({
      where: { transferId },
    });
  }

  async updateTransactionStatus(
    id: string,
    params: {
      status: string;
      txHash?: string | null;
      ledger?: number | null;
      errorCode?: string | null;
      errorMessage?: string | null;
    },
  ): Promise<BlockchainTransaction> {
    return this.prisma.blockchainTransaction.update({
      where: { id },
      data: {
        status: params.status,
        txHash: params.txHash,
        ledger: params.ledger,
        errorCode: params.errorCode,
        errorMessage: params.errorMessage,
      },
    });
  }

  // ----------------------------------------
  // StellarWallet Operations
  // ----------------------------------------

  async createStellarWallet(data: {
    userId: string;
    publicKey: string;
    encryptedSecret: string;
  }): Promise<StellarWallet> {
    return this.prisma.stellarWallet.create({
      data: {
        userId: data.userId,
        publicKey: data.publicKey,
        encryptedSecret: data.encryptedSecret,
        hasTrustline: false,
        isActive: true,
      },
    });
  }

  async findWalletByUserId(userId: string): Promise<StellarWallet | null> {
    return this.prisma.stellarWallet.findUnique({
      where: { userId },
    });
  }

  async findWalletByPublicKey(publicKey: string): Promise<StellarWallet | null> {
    return this.prisma.stellarWallet.findUnique({
      where: { publicKey },
    });
  }

  async updateWalletTrustline(userId: string, hasTrustline: boolean): Promise<StellarWallet> {
    return this.prisma.stellarWallet.update({
      where: { userId },
      data: { hasTrustline },
    });
  }

  async findManyTransactions(params: {
    status?: string;
    page: number;
    limit: number;
  }): Promise<{ data: BlockchainTransaction[]; total: number }> {
    const where: Prisma.BlockchainTransactionWhereInput = {};
    if (params.status) {
      where.status = params.status;
    }

    const [data, total] = await Promise.all([
      this.prisma.blockchainTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.blockchainTransaction.count({ where }),
    ]);

    return { data, total };
  }

  async findManyWallets(params: {
    isActive?: boolean;
    page: number;
    limit: number;
  }): Promise<{ data: StellarWallet[]; total: number }> {
    const where: Prisma.StellarWalletWhereInput = {};
    if (params.isActive !== undefined) {
      where.isActive = params.isActive;
    }

    const [data, total] = await Promise.all([
      this.prisma.stellarWallet.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.stellarWallet.count({ where }),
    ]);

    return { data, total };
  }

  async runInAdvisoryLock<T>(key: number, fn: (repo: IBlockchainRepository) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
      const txRepo = new PrismaBlockchainRepository(tx as any);
      return fn(txRepo);
    });
  }
}
