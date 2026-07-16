import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';

interface ListTransfersParams {
  status?: string;
  page: number;
  limit: number;
}

@Injectable()
export class ListTransfersUseCase {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Return paginated transfers for a given user, optionally filtered by status.
   */
  async execute(userId: string, params: ListTransfersParams) {
    const { status, page, limit } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { userId };
    if (status) {
      where.status = status;
    }

    const [transfers, total] = await Promise.all([
      this.prisma.transfer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.transfer.count({ where }),
    ]);

    return {
      data: transfers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
