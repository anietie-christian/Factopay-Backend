import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { AdminAuditService } from '../../../shared/infrastructure/services/admin-audit.service';

@Injectable()
export class ReviewAlertUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  async execute(alertId: string, adminId: string, ipAddress: string) {
    const alert = await this.prisma.alertRecord.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      throw new NotFoundException(`Alert with ID ${alertId} not found.`);
    }

    if (alert.reviewed) {
      throw new BadRequestException('This alert has already been reviewed.');
    }

    const updatedAlert = await this.prisma.alertRecord.update({
      where: { id: alertId },
      data: {
        reviewed: true,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        status: 'RESOLVED',
      },
    });

    // Log the review action in the admin audit trail
    await this.adminAuditService.log(
      adminId,
      'AML_ALERT_REVIEWED',
      'ALERT',
      alertId,
      {
        ruleName: alert.ruleName,
        severity: alert.severity,
        targetId: alert.targetId,
        targetType: alert.targetType,
      },
      ipAddress,
    );

    return updatedAlert;
  }
}
