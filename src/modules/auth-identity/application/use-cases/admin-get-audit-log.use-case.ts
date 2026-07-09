import { Injectable } from '@nestjs/common';
import { AdminAuditService } from '../../../shared/infrastructure/services/admin-audit.service';
import { AdminAuditLogQueryDto } from '../dtos/admin-audit-log-query.dto';

@Injectable()
export class AdminGetAuditLogUseCase {
  constructor(private readonly auditService: AdminAuditService) {}

  async execute(query: AdminAuditLogQueryDto) {
    const { adminId, action, targetType, startDate, endDate, page = 1, limit = 20 } = query;

    return this.auditService.findMany({
      adminId,
      action,
      targetType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page,
      limit,
    });
  }
}
