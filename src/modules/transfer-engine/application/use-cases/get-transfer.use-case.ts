// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';

@Injectable()
export class GetTransferUseCase {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieve a single transfer by its ID.
   * Only returns transfers owned by the requesting user.
   */
  async execute(userId: string, transferId: string) {
    const transfer = await this.prisma.transfer.findFirst({
      where: { id: transferId, userId },
    });

    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }

    return transfer;
  }
}
