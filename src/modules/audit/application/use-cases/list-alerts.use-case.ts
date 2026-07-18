import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';

@Injectable()
export class ListAlertsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(params: { status?: string; severity?: string; page?: number; limit?: number }) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 10;
    const where: any = {};

    if (params.status) {
      where.status = params.status;
    }
    if (params.severity) {
      where.severity = params.severity;
    }

    const [data, total] = await Promise.all([
      this.prisma.alertRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.alertRecord.count({ where }),
    ]);

    return {
      data,
      meta: {
        totalItems: total,
        itemCount: data.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    };
  }
}
