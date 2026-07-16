import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';

@Injectable()
export class GetTransferByKeyUseCase {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieve a transfer by its idempotency key.
   * This lets the client recover the transfer state after network loss
   * by re-sending the same idempotency key used during creation.
   */
  async execute(userId: string, idempotencyKey: string) {
    const transfer = await this.prisma.transfer.findFirst({
      where: { idempotencyKey, userId },
    });

    if (!transfer) {
      throw new NotFoundException('Transfer not found for this idempotency key');
    }

    return transfer;
  }
}
