import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';

@Injectable()
export class AdminDashboardOverviewUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      pendingKyc,
      activeUsers30d,
      suspendedUsers,
      newRegistrations7d,
    ] = await Promise.all([
      // 1. Total standard users
      this.prisma.user.count({ where: { role: 'USER' } }),

      // 2. Users with pending KYC review
      this.prisma.user.count({ where: { kycStatus: 'PENDING', role: 'USER' } }),

      // 3. Active users (logged in within 30 days)
      this.prisma.user.count({
        where: {
          role: 'USER',
          lastLoginAt: { gte: thirtyDaysAgo },
        },
      }),

      // 4. Suspended/deactivated users
      this.prisma.user.count({ where: { isActive: false, role: 'USER' } }),

      // 5. New registrations in the last 7 days
      this.prisma.user.count({
        where: {
          role: 'USER',
          createdAt: { gte: sevenDaysAgo },
        },
      }),
    ]);

    return {
      stats: {
        totalUsers,
        pendingKyc,
        activeUsers30d,
        suspendedUsers,
        newRegistrations7d,
      },
    };
  }
}
