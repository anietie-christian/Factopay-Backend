// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { AdminAuditService } from '../../../shared/infrastructure/services/admin-audit.service';
import { AdminRejectKycDto } from '../dtos/admin-reject-kyc.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { KycStatusChangedEvent } from '../../domain/events/kyc-status-changed.event';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AdminRejectKycUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAuditService: AdminAuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(userId: string, dto: AdminRejectKycDto, adminId: string, adminEmail: string, ipAddress: string) {
    // 1. Fetch user
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found.`);
    }

    // 2. Validate current KYC status
    if (user.kycStatus === 'REJECTED') {
      throw new BadRequestException('This user is already KYC rejected.');
    }

    // 3. Update user KYC status and reset tier
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        kycStatus: 'REJECTED',
        kycTier: 'NONE',
      },
    });

    // 4. Create verification attempt record
    await this.prisma.kycVerificationAttempt.create({
      data: {
        id: uuidv4(),
        userId,
        provider: 'ADMIN_MANUAL',
        status: 'REJECTED',
        reason: dto.reason,
      },
    });

    // 5. Log to admin audit trail
    await this.adminAuditService.log(
      adminId,
      'KYC_REJECTED',
      'USER',
      userId,
      { previousStatus: user.kycStatus, newStatus: 'REJECTED', reason: dto.reason, rejectedBy: adminEmail },
      ipAddress,
    );

    // 6. Emit KYC status changed event
    this.eventEmitter.emit(
      KycStatusChangedEvent.eventName,
      new KycStatusChangedEvent(
        userId,
        user.kycStatus,
        'REJECTED',
        user.kycTier,
        'NONE',
      ),
    );

    return {
      message: `KYC rejected for user ${userId}.`,
      userId: updatedUser.id,
      kycStatus: updatedUser.kycStatus,
      reason: dto.reason,
    };
  }
}
