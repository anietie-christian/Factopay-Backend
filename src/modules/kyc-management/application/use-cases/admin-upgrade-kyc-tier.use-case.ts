import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { AdminAuditService } from '../../../shared/infrastructure/services/admin-audit.service';
import { AdminUpgradeTierDto } from '../dtos/admin-upgrade-tier.dto';

@Injectable()
export class AdminUpgradeKycTierUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  async execute(userId: string, dto: AdminUpgradeTierDto, adminId: string, ipAddress: string) {
    // 1. Fetch user
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found.`);
    }

    // 2. Must be KYC approved to upgrade tier
    if (user.kycStatus !== 'APPROVED') {
      throw new BadRequestException(
        `Cannot upgrade tier for a user with KYC status "${user.kycStatus}". User must be APPROVED first.`,
      );
    }

    // 3. Validate it's actually an upgrade (not a downgrade or same tier)
    const tierOrder = ['NONE', 'TIER_1', 'TIER_2', 'TIER_3'];
    const currentTierIndex = tierOrder.indexOf(user.kycTier);
    const newTierIndex = tierOrder.indexOf(dto.newTier);

    if (newTierIndex <= currentTierIndex) {
      throw new BadRequestException(
        `Cannot upgrade: user is already at ${user.kycTier}. New tier must be higher than the current tier.`,
      );
    }

    // 4. Update user tier
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { kycTier: dto.newTier },
    });

    // 5. Log to admin audit trail
    await this.adminAuditService.log(
      adminId,
      'KYC_TIER_UPGRADED',
      'USER',
      userId,
      { previousTier: user.kycTier, newTier: dto.newTier, reason: dto.reason },
      ipAddress,
    );

    return {
      message: `KYC tier upgraded from ${user.kycTier} to ${dto.newTier} for user ${userId}.`,
      userId: updatedUser.id,
      kycTier: updatedUser.kycTier,
    };
  }
}
