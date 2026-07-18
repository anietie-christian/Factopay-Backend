import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { AdminAuditService } from '../../../shared/infrastructure/services/admin-audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class AdminRetryTransferUseCase {
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

    if (transfer.status !== 'FAILED') {
      throw new BadRequestException(`Only FAILED transfers can be retried.`);
    }

    const updatedTransfer = await this.prisma.transfer.update({
      where: { id: transferId },
      data: {
        status: 'CREATED',
        adminNotes: `Retried by admin: ${notes}`,
      },
    });

    await this.prisma.transferEvent.create({
      data: {
        transferId: transferId,
        status: 'CREATED',
        metadata: { message: `Retried by admin: ${notes}`, adminId },
      },
    });

    await this.adminAuditService.log(
      adminId,
      'TRANSFER_RETRIED_BY_ADMIN',
      'TRANSFER',
      transferId,
      { notes },
      ipAddress,
    );

    this.eventEmitter.emit('transfer.initiated', updatedTransfer);

    return updatedTransfer;
  }
}
