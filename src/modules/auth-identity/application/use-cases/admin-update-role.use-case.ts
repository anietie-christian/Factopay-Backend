import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { AdminAuditService } from '../../../shared/infrastructure/services/admin-audit.service';
import { AdminUpdateRoleDto } from '../dtos/admin-update-role.dto';

@Injectable()
export class AdminUpdateRoleUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  async execute(userId: string, dto: AdminUpdateRoleDto, adminId: string, ipAddress: string) {
    // 1. Fetch user
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found.`);
    }

    // 2. Prevent role self-modification
    if (user.id === adminId) {
      throw new BadRequestException('You cannot modify your own role.');
    }

    // 3. Prevent target user from being SUPERADMIN
    if (user.role === 'SUPERADMIN') {
      throw new BadRequestException('SUPERADMIN roles cannot be modified.');
    }

    // 4. Update role
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { role: dto.role },
    });

    // 5. Log audit trail
    await this.adminAuditService.log(
      adminId,
      'ROLE_CHANGED',
      'USER',
      userId,
      { previousRole: user.role, newRole: dto.role },
      ipAddress,
    );

    return {
      message: `User ${userId} role updated to ${dto.role}.`,
      userId: updatedUser.id,
      role: updatedUser.role,
    };
  }
}
