// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { AdminAuditService } from '../../../shared/infrastructure/services/admin-audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class AdminResolveTransferUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAuditService: AdminAuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(params: {
    transferId: string;
    adminId: string;
    notes: string;
    ipAddress: string;
  }) {
    const { transferId, adminId, notes, ipAddress } = params;

    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
    });

    if (!transfer) {
      throw new NotFoundException(`Transfer ${transferId} not found.`);
    }

    if (transfer.status === 'COMPLETED' || transfer.status === 'FAILED' || transfer.status === 'CANCELLED') {
      throw new BadRequestException(`Transfer is already finalized with status: ${transfer.status}`);
    }

    const updatedTransfer = await this.prisma.transfer.update({
      where: { id: transferId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        adminNotes: `Manually resolved by admin: ${notes}`,
      },
    });

    await this.prisma.transferEvent.create({
      data: {
        transferId: transferId,
        status: 'COMPLETED',
        metadata: { message: `Manually resolved by admin: ${notes}`, adminId },
      },
    });

    // Log admin audit event
    await this.adminAuditService.log(
      adminId,
      'TRANSFER_RESOLVED_BY_ADMIN',
      'TRANSFER',
      transferId,
      { notes },
      ipAddress,
    );

    // Emit transfer completion event
    this.eventEmitter.emit('transfer.completed', {
      transferId: transfer.id,
      userId: transfer.userId,
      amount: transfer.amount.toString(),
      currency: transfer.sourceCurrency,
      recipientId: transfer.recipientId || '',
    });

    return updatedTransfer;
  }
}
