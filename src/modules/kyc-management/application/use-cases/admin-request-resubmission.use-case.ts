import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { AdminAuditService } from '../../../shared/infrastructure/services/admin-audit.service';
import { AdminRequestResubmissionDto } from '../dtos/admin-request-resubmission.dto';

@Injectable()
export class AdminRequestResubmissionUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  async execute(userId: string, dto: AdminRequestResubmissionDto, adminId: string, ipAddress: string) {
    // 1. Fetch user
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found.`);
    }

    // 2. Only allow resubmission requests for users in PENDING or REJECTED status
    if (!['PENDING', 'REJECTED'].includes(user.kycStatus)) {
      throw new BadRequestException(
        `Cannot request resubmission for a user with KYC status "${user.kycStatus}". Only PENDING or REJECTED users can be asked to resubmit.`,
      );
    }

    // 3. Update user KYC status
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { kycStatus: 'RESUBMISSION_REQUIRED' },
    });

    // 4. Log to admin audit trail
    await this.adminAuditService.log(
      adminId,
      'KYC_RESUBMISSION_REQUESTED',
      'USER',
      userId,
      { previousStatus: user.kycStatus, message: dto.message },
      ipAddress,
    );

    // TODO: Send notification to user with the admin's message via email/push

    return {
      message: `Resubmission requested for user ${userId}.`,
      userId: updatedUser.id,
      kycStatus: updatedUser.kycStatus,
      adminMessage: dto.message,
    };
  }
}
