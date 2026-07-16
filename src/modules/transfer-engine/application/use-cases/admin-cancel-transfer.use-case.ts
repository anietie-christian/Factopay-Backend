import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { ReverseLedgerTransactionUseCase } from '../../../wallet-ledger/application/use-cases/reverse-ledger-transaction.use-case';
import { AdminAuditService } from '../../../shared/infrastructure/services/admin-audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class AdminCancelTransferUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reverseLedgerUseCase: ReverseLedgerTransactionUseCase,
    private readonly adminAuditService: AdminAuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(params: {
    transferId: string;
    adminId: string;
    reason: string;
    ipAddress: string;
  }) {
    const { transferId, adminId, reason, ipAddress } = params;

    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
    });

    if (!transfer) {
      throw new NotFoundException(`Transfer ${transferId} not found.`);
    }

    if (transfer.status === 'COMPLETED' || transfer.status === 'FAILED' || transfer.status === 'CANCELLED') {
      throw new BadRequestException(`Transfer cannot be cancelled from status: ${transfer.status}`);
    }

    // Reverse ledger entries
    try {
      await this.reverseLedgerUseCase.execute(transferId);
    } catch (error) {
      // If no ledger entries exist to reverse, we continue gracefully
    }

    const updatedTransfer = await this.prisma.transfer.update({
      where: { id: transferId },
      data: {
        status: 'CANCELLED',
        failureReason: reason,
        cancelledAt: new Date(),
        adminNotes: `Cancelled by admin: ${reason}`,
      },
    });

    // Log admin audit event
    await this.adminAuditService.log(
      adminId,
      'TRANSFER_CANCELLED_BY_ADMIN',
      'TRANSFER',
      transferId,
      { reason },
      ipAddress,
    );

    // Emit failure/cancellation event
    this.eventEmitter.emit('transfer.failed', {
      transferId: transfer.id,
      userId: transfer.userId,
      amount: transfer.amount.toString(),
      currency: transfer.currency,
      recipientId: transfer.recipientId || '',
      failureReason: `Cancelled by admin: ${reason}`,
    });

    return updatedTransfer;
  }
}
