import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { AdminAuditService } from '../../../shared/infrastructure/services/admin-audit.service';
import { AdminSuspendUserDto } from '../dtos/admin-suspend-user.dto';

@Injectable()
export class AdminSuspendUserUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  async execute(userId: string, dto: AdminSuspendUserDto, adminId: string, ipAddress: string) {
    // 1. Fetch user
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found.`);
    }

    // 2. Prevent self-suspension
    if (user.id === adminId) {
      throw new BadRequestException('You cannot suspend your own admin account.');
    }

    // 3. Check if already suspended
    if (!user.isActive) {
      throw new BadRequestException('This user account is already suspended.');
    }

    // 4. Perform database updates in a transaction
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { isActive: false },
      }),
      this.prisma.authSession.updateMany({
        where: { userId, isRevoked: false },
        data: { isRevoked: true },
      }),
    ]);

    // 5. Log audit trail
    await this.adminAuditService.log(
      adminId,
      'USER_SUSPENDED',
      'USER',
      userId,
      { reason: dto.reason },
      ipAddress,
    );

    return {
      message: `User ${userId} has been suspended successfully and all active sessions revoked.`,
      userId,
      isActive: false,
      reason: dto.reason,
    };
  }
}
