import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { AdminUsersQueryDto } from '../dtos/admin-users-query.dto';

@Injectable()
export class AdminListUsersUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: AdminUsersQueryDto) {
    const { search, role, kycStatus, isActive, sortBy = 'createdAt', order = 'desc', page = 1, limit = 20 } = query;

    const where: any = {};

    if (role) {
      where.role = role;
    }

    if (kycStatus) {
      where.kycStatus = kycStatus;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search, mode: 'insensitive' } },
        { profile: { firstName: { contains: search, mode: 'insensitive' } } },
        { profile: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          phoneNumber: true,
          role: true,
          kycStatus: true,
          kycTier: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          profile: {
            select: {
              firstName: true,
              lastName: true,
              countryOfResidence: true,
            },
          },
        },
        orderBy: { [sortBy]: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    const mappedData = data.map((user) => ({
      userId: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      kycStatus: user.kycStatus,
      kycTier: user.kycTier,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      name: user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : null,
      country: user.profile?.countryOfResidence ?? null,
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
