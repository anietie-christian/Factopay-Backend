import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
import {
  IStellarGateway,
  STELLAR_GATEWAY_TOKEN,
  StellarWalletRole,
} from '../../domain/gateways/stellar-gateway.interface';
import {
  IBlockchainRepository,
  BLOCKCHAIN_REPOSITORY_TOKEN,
} from '../../domain/repositories/blockchain-repository.interface';
import { DestinationAllowlistService } from '../../infrastructure/security/destination-allowlist.service';
import { SettlementLimitsService } from '../../infrastructure/security/settlement-limits.service';
import { AdminAuditService } from '../../../shared/infrastructure/services/admin-audit.service';
import {
  BlockchainErrorCode,
  BlockchainSettlementException,
} from '../../domain/errors/blockchain-errors';
import { MemoResolver } from '../../domain/models/memo-resolver';
import { VerifySettlementUseCase } from './verify-settlement.use-case';
import { ConfigService } from '@nestjs/config';
import { BlockchainTransaction } from '@prisma/client';

@Injectable()
export class SubmitSettlementUseCase {
  private readonly logger = new Logger(SubmitSettlementUseCase.name);

  constructor(
    @Inject(STELLAR_GATEWAY_TOKEN)
    private readonly stellarGateway: IStellarGateway,
    @Inject(BLOCKCHAIN_REPOSITORY_TOKEN)
    private readonly repository: IBlockchainRepository,
    private readonly allowlist: DestinationAllowlistService,
    private readonly limits: SettlementLimitsService,
    private readonly adminAuditService: AdminAuditService,
    private readonly verifyUseCase: VerifySettlementUseCase,
    private readonly memoResolver: MemoResolver,
    private readonly configService: ConfigService,
  ) {}

  async execute(params: {
    transferId: string;
    destinationPublicKey: string;
    amount: string;
    memo?: string;
    adminId: string;
    ipAddress: string;
  }): Promise<BlockchainTransaction> {
    const { transferId, destinationPublicKey, amount, adminId, ipAddress } = params;

    // Auto-resolve memo if not explicitly provided
    const memo = params.memo || this.memoResolver.resolve(destinationPublicKey, transferId);

    this.logger.log(`Initiating blockchain settlement for transfer ${transferId} to ${destinationPublicKey}`);

    // 1. Idempotency & Verification checks
    let existingTx = await this.repository.findTransactionByTransferId(transferId);
    if (existingTx) {
      if (existingTx.status === 'SUCCESS') {
        this.logger.log(`Settlement for transfer ${transferId} already completed successfully. Returning transaction.`);
        return existingTx;
      }
      
      if (existingTx.status === 'PENDING' || existingTx.status === 'PENDING_VERIFICATION') {
        this.logger.log(`Settlement for transfer ${transferId} is currently ${existingTx.status}. Verifying first...`);
        try {
          const verifiedTx = await this.verifyUseCase.execute(existingTx.id);
          if (verifiedTx.status === 'SUCCESS' || verifiedTx.status === 'PENDING_VERIFICATION') {
            return verifiedTx;
          }
          // If verification confirms it failed, we can proceed with retry below
          existingTx = verifiedTx;
        } catch (error) {
          this.logger.error(`Verification of pending transaction ${existingTx.id} failed`, error);
          throw new BadRequestException(`Transaction is in progress and cannot be resubmitted yet.`);
        }
      }
    }

    // 2. Security Check: Destination Allowlist
    if (!this.allowlist.isAllowed(destinationPublicKey)) {
      throw new BlockchainSettlementException(
        BlockchainErrorCode.DESTINATION_NOT_ALLOWLISTED,
        `Destination address ${destinationPublicKey} is not in the approved anchor allowlist`,
      );
    }

    // 3. Security Check: Amount & Daily Outflow limits
    const limitCheck = await this.limits.checkLimits(amount);
    if (!limitCheck.allowed) {
      throw new BlockchainSettlementException(
        limitCheck.reason || BlockchainErrorCode.AMOUNT_EXCEEDS_LIMIT,
        limitCheck.details || 'Outflow limit checks failed',
      );
    }

    // 4. Create/Reset PENDING transaction record
    let dbTx: BlockchainTransaction;
    if (existingTx) {
      // Reuse the existing failed transaction row to respect the unique constraint on transferId
      dbTx = await this.repository.updateTransactionStatus(existingTx.id, {
        status: 'PENDING',
        txHash: null,
        ledger: null,
        errorCode: null,
        errorMessage: null,
      });
    } else {
      const masterWalletPublicKey = this.configService.get<string>('STELLAR_MASTER_PUBLIC', 'GMASTERDEFAULT');
      dbTx = await this.repository.createTransaction({
        transferId,
        sourceAddress: masterWalletPublicKey,
        destAddress: destinationPublicKey,
        amount,
        memo,
        status: 'PENDING',
      });
    }

    try {
      // 5. Submit payment transaction
      const result = await this.stellarGateway.sendUsdc({
        senderRole: StellarWalletRole.MASTER,
        destinationPublicKey,
        amount,
        memo,
      });

      // 6. Record success
      const successTx = await this.repository.updateTransactionStatus(dbTx.id, {
        status: 'SUCCESS',
        txHash: result.txHash,
        ledger: result.ledger,
      });

      // 7. Audit Logging
      await this.adminAuditService.log(
        adminId,
        'BLOCKCHAIN_SETTLEMENT_SUBMITTED',
        'TRANSFER',
        transferId,
        {
          blockchainTransactionId: dbTx.id,
          txHash: result.txHash,
          destinationPublicKey,
          amount,
          memo,
        },
        ipAddress,
      );

      return successTx;
    } catch (error) {
      this.logger.error(`Blockchain settlement failed for transfer ${transferId}`, error);

      const errorCode = error instanceof BlockchainSettlementException ? error.code : BlockchainErrorCode.TX_FAILED;
      const errorMessage = error.message || 'Unknown transaction submission failure';

      // 8. Timeout handling: verify transaction state immediately before marking as failed
      if (errorCode === BlockchainErrorCode.TX_TIMEOUT) {
        this.logger.warn(`Transaction timed out for transfer ${transferId}. Attempting instant verification...`);
        try {
          const verifiedTx = await this.verifyUseCase.execute(dbTx.id);
          if (verifiedTx.status === 'SUCCESS') {
            return verifiedTx;
          }
        } catch (verifError) {
          this.logger.error(`Instant timeout verification failed for transfer ${transferId}`, verifError);
        }

        // Set to PENDING_VERIFICATION if verification is inconclusive
        return await this.repository.updateTransactionStatus(dbTx.id, {
          status: 'PENDING_VERIFICATION',
          errorCode: errorCode.toString(),
          errorMessage: 'Transaction timed out. Verification pending.',
        });
      }

      // Record standard failure
      const failedTx = await this.repository.updateTransactionStatus(dbTx.id, {
        status: 'FAILED',
        errorCode: errorCode.toString(),
        errorMessage,
      });

      // Audit Log for failure
      await this.adminAuditService.log(
        adminId,
        'BLOCKCHAIN_SETTLEMENT_FAILED',
        'TRANSFER',
        transferId,
        {
          blockchainTransactionId: dbTx.id,
          errorCode,
          errorMessage,
          destinationPublicKey,
          amount,
        },
        ipAddress,
      );

      throw error;
    }
  }
}
