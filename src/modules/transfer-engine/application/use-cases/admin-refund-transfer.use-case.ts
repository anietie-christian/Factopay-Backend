import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { ReverseLedgerTransactionUseCase } from '../../../wallet-ledger/application/use-cases/reverse-ledger-transaction.use-case';
import { AdminAuditService } from '../../../shared/infrastructure/services/admin-audit.service';

@Injectable()
export class AdminRefundTransferUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reverseLedgerUseCase: ReverseLedgerTransactionUseCase,
    private readonly adminAuditService: AdminAuditService,
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

    if (transfer.status === 'COMPLETED' || transfer.status === 'CANCELLED') {
      throw new BadRequestException(`Transfer cannot be refunded from status: ${transfer.status}`);
    }

    try {
      await this.reverseLedgerUseCase.execute(transferId);
    } catch (error) {
      throw new BadRequestException(`Could not refund ledger entries. ${error.message}`);
    }

    const updatedTransfer = await this.prisma.transfer.update({
      where: { id: transferId },
      data: {
        status: 'CANCELLED',
        adminNotes: `Refunded by admin: ${reason}`,
      },
    });

    await this.prisma.transferEvent.create({
      data: {
        transferId: transferId,
        status: 'CANCELLED',
        metadata: { message: `Refunded by admin: ${reason}`, adminId },
      },
    });

    await this.adminAuditService.log(
      adminId,
      'TRANSFER_REFUNDED_BY_ADMIN',
      'TRANSFER',
      transferId,
      { reason },
      ipAddress,
    );

    return updatedTransfer;
  }
}
