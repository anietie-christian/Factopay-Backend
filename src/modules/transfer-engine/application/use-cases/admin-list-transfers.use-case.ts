// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { AdminListTransfersQueryDto } from '../dtos/admin-transfer.dto';

@Injectable()
export class AdminListTransfersUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: AdminListTransfersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.userId) {
      where.userId = query.userId;
    }
    if (query.adminReviewStatus) {
      where.adminReviewStatus = query.adminReviewStatus;
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
