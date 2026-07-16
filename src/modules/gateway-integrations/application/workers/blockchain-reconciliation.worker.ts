import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { VerifySettlementUseCase } from '../../../blockchain-settlement/application/use-cases/verify-settlement.use-case';
import { ReverseLedgerTransactionUseCase } from '../../../wallet-ledger/application/use-cases/reverse-ledger-transaction.use-case';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class BlockchainReconciliationWorker {
  private readonly logger = new Logger(BlockchainReconciliationWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly verifySettlementUseCase: VerifySettlementUseCase,
    private readonly reverseLedgerUseCase: ReverseLedgerTransactionUseCase,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcileTransactions() {
    this.logger.log('Starting Blockchain reconciliation job...');

    // Find transactions stuck in PENDING_VERIFICATION for more than 2 minutes
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const stuckTxs = await this.prisma.blockchainTransaction.findMany({
      where: {
        status: 'PENDING_VERIFICATION',
        updatedAt: {
          lt: twoMinutesAgo,
        },
      },
    });

    this.logger.log(`Found ${stuckTxs.length} pending verification blockchain transactions to reconcile.`);

    for (const tx of stuckTxs) {
      try {
        this.logger.log(`Reconciling blockchain tx ${tx.id} (transfer: ${tx.transferId})`);
        
        // Execute settlement verification (which polls Horizon/Stellar net)
        const updatedTx = await this.verifySettlementUseCase.execute(tx.id);

        if (updatedTx.status === 'SUCCESS') {
          this.logger.log(`Reconciliation SUCCESS for tx ${tx.id}. Completing transfer.`);
          
          const transfer = await this.prisma.transfer.update({
            where: { id: tx.transferId },
            data: { status: 'COMPLETED' },
          });

          this.eventEmitter.emit('transfer.completed', {
            transferId: transfer.id,
            userId: transfer.userId,
            amount: transfer.amount.toString(),
            currency: transfer.currency,
            recipientId: transfer.recipientId || '',
          });

        } else if (updatedTx.status === 'FAILED') {
          this.logger.error(`Reconciliation FAILED for tx ${tx.id}. Reversing ledger entries.`);

          // Reverse double-entry ledger record
          try {
            await this.reverseLedgerUseCase.execute(tx.transferId);
          } catch (ledgerError) {
            this.logger.error(`Failed to reverse ledger for transfer ${tx.transferId}`, ledgerError);
          }

          const transfer = await this.prisma.transfer.update({
            where: { id: tx.transferId },
            data: { status: 'FAILED' },
          });

          this.eventEmitter.emit('transfer.failed', {
            transferId: transfer.id,
            userId: transfer.userId,
            amount: transfer.amount.toString(),
            currency: transfer.currency,
            recipientId: transfer.recipientId || '',
            failureReason: updatedTx.errorMessage || 'Blockchain settlement failed',
          });

        } else {
          // If still pending verification, check if it's older than 1 hour to trigger alert
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          if (tx.createdAt < oneHourAgo) {
            this.logger.error(`Transaction ${tx.id} is stuck in PENDING_VERIFICATION for >1 hour! Raising alert.`);

            // Deduplicate alert records
            const existingAlert = await this.prisma.alertRecord.findFirst({
              where: {
                ruleName: 'BLOCKCHAIN_VERIFICATION_STUCK',
                targetId: tx.id,
                status: 'OPEN',
              },
            });

            if (!existingAlert) {
              await this.prisma.alertRecord.create({
                data: {
                  ruleName: 'BLOCKCHAIN_VERIFICATION_STUCK',
                  severity: 'HIGH',
                  status: 'OPEN',
                  targetId: tx.id,
                  targetType: 'BLOCKCHAIN_TRANSACTION',
                  metadata: {
                    transferId: tx.transferId,
                    txHash: tx.txHash,
                    amount: tx.amount.toString(),
                    createdAt: tx.createdAt,
                  },
                },
              });
            }
          }
        }
      } catch (error) {
        this.logger.error(`Failed to reconcile transaction ${tx.id}`, error);
      }
    }

    this.logger.log('Blockchain reconciliation job finished.');
  }
}
