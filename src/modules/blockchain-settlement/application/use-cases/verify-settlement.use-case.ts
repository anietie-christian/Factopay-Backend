import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import {
  IStellarGateway,
  STELLAR_GATEWAY_TOKEN,
} from '../../domain/gateways/stellar-gateway.interface';
import {
  IBlockchainRepository,
  BLOCKCHAIN_REPOSITORY_TOKEN,
} from '../../domain/repositories/blockchain-repository.interface';
import { BlockchainTransaction } from '@prisma/client';

@Injectable()
export class VerifySettlementUseCase {
  private readonly logger = new Logger(VerifySettlementUseCase.name);

  constructor(
    @Inject(STELLAR_GATEWAY_TOKEN)
    private readonly stellarGateway: IStellarGateway,
    @Inject(BLOCKCHAIN_REPOSITORY_TOKEN)
    private readonly repository: IBlockchainRepository,
  ) {}

  async execute(blockchainTransactionId: string): Promise<BlockchainTransaction> {
    this.logger.log(`Verifying blockchain transaction status for ID: ${blockchainTransactionId}`);

    // Load from DB
    let tx = await this.repository.findTransactionById(blockchainTransactionId);
    if (!tx) {
      // Fallback: try checking by transferId
      tx = await this.repository.findTransactionByTransferId(blockchainTransactionId);
    }

    if (!tx) {
      throw new NotFoundException(`Blockchain transaction with ID/TransferID ${blockchainTransactionId} not found`);
    }

    // If already finalized, return directly
    if (tx.status === 'SUCCESS' || tx.status === 'FAILED') {
      return tx;
    }

    if (!tx.txHash) {
      // No hash recorded, can't verify directly via hash.
      // Mark as FAILED since no hash was ever generated/attached.
      this.logger.warn(`Transaction ${tx.id} has no hash recorded. Marking as FAILED.`);
      return this.repository.updateTransactionStatus(tx.id, {
        status: 'FAILED',
        errorCode: 'TX_FAILED',
        errorMessage: 'Transaction failed before hash generation',
      });
    }

    try {
      const verification = await this.stellarGateway.verifyTransaction(tx.txHash);

      if (verification.exists) {
        if (verification.successful) {
          this.logger.log(`Transaction ${tx.txHash} successfully verified on-chain in ledger ${verification.ledger}`);
          return await this.repository.updateTransactionStatus(tx.id, {
            status: 'SUCCESS',
            ledger: verification.ledger,
          });
        } else {
          this.logger.error(`Transaction ${tx.txHash} failed on-chain`);
          return await this.repository.updateTransactionStatus(tx.id, {
            status: 'FAILED',
            errorCode: 'TX_FAILED',
            errorMessage: 'Transaction execution failed on Stellar network',
          });
        }
      } else {
        // Not found on Horizon. Check age.
        const ageInMs = Date.now() - new Date(tx.createdAt).getTime();
        const tenMinutes = 10 * 60 * 1000;

        if (ageInMs > tenMinutes) {
          this.logger.warn(`Transaction ${tx.txHash} not found on-chain after 10 minutes. Marking as FAILED.`);
          return await this.repository.updateTransactionStatus(tx.id, {
            status: 'FAILED',
            errorCode: 'TX_TIMEOUT',
            errorMessage: 'Transaction not found on-chain after verification timeout window',
          });
        }

        // Keep as pending verification
        this.logger.log(`Transaction ${tx.txHash} not found yet. Keeping as PENDING_VERIFICATION.`);
        return await this.repository.updateTransactionStatus(tx.id, {
          status: 'PENDING_VERIFICATION',
        });
      }
    } catch (error) {
      this.logger.error(`Failed to verify transaction ${tx.txHash} against Horizon`, error);
      // Leave state unchanged and throw so caller/job knows it failed to verify
      throw error;
    }
  }
}
