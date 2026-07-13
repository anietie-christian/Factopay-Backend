/**
 * Blockchain Repository Interface
 *
 * Defines the persistence contract for blockchain transactions and wallets.
 * Infrastructure adapters (e.g. PrismaBlockchainRepository) implement this
 * interface — use cases depend only on this abstraction.
 */

import { BlockchainTransaction, StellarWallet, Prisma } from '@prisma/client';

export const BLOCKCHAIN_REPOSITORY_TOKEN = Symbol('IBlockchainRepository');

export interface IBlockchainRepository {
  // ----------------------------------------
  // BlockchainTransaction Operations
  // ----------------------------------------

  createTransaction(data: {
    transferId: string;
    sourceAddress: string;
    destAddress: string;
    amount: Prisma.Decimal | number | string;
    memo?: string;
    status: string;
  }): Promise<BlockchainTransaction>;

  findTransactionById(id: string): Promise<BlockchainTransaction | null>;

  findTransactionByTransferId(transferId: string): Promise<BlockchainTransaction | null>;

  updateTransactionStatus(
    id: string,
    params: {
      status: string;
      txHash?: string | null;
      ledger?: number | null;
      errorCode?: string | null;
      errorMessage?: string | null;
    },
  ): Promise<BlockchainTransaction>;

  findManyTransactions(params: {
    status?: string;
    page: number;
    limit: number;
  }): Promise<{ data: BlockchainTransaction[]; total: number }>;

  // ----------------------------------------
  // StellarWallet Operations
  // ----------------------------------------

  createStellarWallet(data: {
    userId: string;
    publicKey: string;
    encryptedSecret: string;
  }): Promise<StellarWallet>;

  findWalletByUserId(userId: string): Promise<StellarWallet | null>;

  findWalletByPublicKey(publicKey: string): Promise<StellarWallet | null>;

  updateWalletTrustline(userId: string, hasTrustline: boolean): Promise<StellarWallet>;

  findManyWallets(params: {
    isActive?: boolean;
    page: number;
    limit: number;
  }): Promise<{ data: StellarWallet[]; total: number }>;

  /**
   * Calculates the sum of transaction amounts matching specified parameters.
   */
  getSummedAmount(
    sourceAddress: string,
    statuses: string[],
    start: Date,
    end: Date,
  ): Promise<Prisma.Decimal>;

  /**
   * Executes a block of operations within a transactional advisory lock.
   */
  runInAdvisoryLock<T>(key: number, fn: (repo: IBlockchainRepository) => Promise<T>): Promise<T>;
}
