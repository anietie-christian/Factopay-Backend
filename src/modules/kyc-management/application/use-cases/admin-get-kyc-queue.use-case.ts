// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { AdminKycQueueQueryDto } from '../dtos/admin-kyc-queue-query.dto';

@Injectable()
export class AdminGetKycQueueUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: AdminKycQueueQueryDto) {
    const { search, status, country, startDate, endDate, page = 1, limit = 20 } = query;

    const where: any = {};

    // Filter by KYC status
    if (status) {
      where.kycStatus = status;
    }

    // Search by name or email
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { profile: { firstName: { contains: search, mode: 'insensitive' } } },
        { profile: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Filter by country of residence
    if (country) {
      where.profile = {
        ...where.profile,
        countryOfResidence: country,
      };
    }

    // Filter by date range (based on profile creation/update time)
    if (startDate || endDate) {
      where.updatedAt = {};
      if (startDate) where.updatedAt.gte = new Date(startDate);
      if (endDate) where.updatedAt.lte = new Date(endDate);
    }

    // Only show users (not admin accounts)
    where.role = 'USER';

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          kycStatus: true,
          kycTier: true,
          updatedAt: true,
          profile: {
            select: {
              firstName: true,
              lastName: true,
              countryOfResidence: true,
            },
          },
          kycDocuments: {
            select: {
              id: true,
              documentType: true,
              status: true,
              createdAt: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    // Map to frontend-friendly response
    const mappedData = data.map((user) => ({
      userId: user.id,
      name: user.profile
        ? `${user.profile.firstName} ${user.profile.lastName}`
        : 'No profile',
      email: user.email,
      country: user.profile?.countryOfResidence ?? 'N/A',
      submittedAt: user.updatedAt,
      status: user.kycStatus,
      documentsCount: user.kycDocuments.length,
    }));

    return {
      data: mappedData,
      meta: {
        totalItems: total,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    };
  }
}
