// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { AdminAuditService } from '../../../shared/infrastructure/services/admin-audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { KycStatusChangedEvent } from '../../domain/events/kyc-status-changed.event';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AdminApproveKycUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAuditService: AdminAuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(userId: string, adminId: string, adminEmail: string, ipAddress: string) {
    // 1. Fetch user
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found.`);
    }

    // 2. Validate current KYC status
    if (user.kycStatus === 'APPROVED') {
      throw new BadRequestException('This user is already KYC approved.');
    }

    // 3. Update user KYC status and assign initial tier
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        kycStatus: 'APPROVED',
        kycTier: 'TIER_1',
      },
    });

    // 4. Create verification attempt record for audit trail
    await this.prisma.kycVerificationAttempt.create({
      data: {
        id: uuidv4(),
        userId,
        provider: 'ADMIN_MANUAL',
        status: 'APPROVED',
        reason: `Approved by admin: ${adminEmail}`,
      },
    });

    // 5. Log to admin audit trail
    await this.adminAuditService.log(
      adminId,
      'KYC_APPROVED',
      'USER',
      userId,
      { previousStatus: user.kycStatus, newStatus: 'APPROVED', newTier: 'TIER_1' },
      ipAddress,
    );

    // 6. Emit KYC status changed event
    this.eventEmitter.emit(
      KycStatusChangedEvent.eventName,
      new KycStatusChangedEvent(
        userId,
        user.kycStatus,
        'APPROVED',
        user.kycTier,
        'TIER_1',
      ),
    );

    return {
      message: `KYC approved for user ${userId}. Tier set to TIER_1.`,
      userId: updatedUser.id,
      kycStatus: updatedUser.kycStatus,
      kycTier: updatedUser.kycTier,
    };
  }
}
