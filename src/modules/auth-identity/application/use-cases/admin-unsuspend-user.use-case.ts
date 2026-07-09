import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { AdminAuditService } from '../../../shared/infrastructure/services/admin-audit.service';

@Injectable()
export class AdminUnsuspendUserUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  async execute(userId: string, adminId: string, ipAddress: string) {
    // 1. Fetch user
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found.`);
    }

    // 2. Check if already active
    if (user.isActive) {
      throw new BadRequestException('This user account is already active.');
    }

    // 3. Reactivate user
    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    });

    // 4. Log audit trail
    await this.adminAuditService.log(
      adminId,
      'USER_UNSUSPENDED',
      'USER',
      userId,
      null,
      ipAddress,
    );

    return {
      message: `User ${userId} has been unsuspended successfully.`,
      userId,
      isActive: true,
    };
  }
}
