import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class UserCancelTransferUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(userId: string, transferId: string) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
    });

    if (!transfer || transfer.userId !== userId) {
      throw new NotFoundException(`Transfer not found.`);
    }

    if (transfer.status !== 'CREATED' && transfer.status !== 'PENDING_KYC') {
      throw new BadRequestException(`Transfer cannot be cancelled from status: ${transfer.status}`);
    }

    const updatedTransfer = await this.prisma.transfer.update({
      where: { id: transferId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    await this.prisma.transferEvent.create({
      data: {
        transferId: transferId,
        status: 'CANCELLED',
        metadata: { message: 'Cancelled by user' },
      },
    });

    this.eventEmitter.emit('transfer.failed', {
      transferId: transfer.id,
      userId: transfer.userId,
      amount: transfer.amount.toString(),
      currency: transfer.sourceCurrency,
      recipientId: transfer.recipientId || '',
      failureReason: 'Cancelled by user',
    });

    return updatedTransfer;
  }
}
