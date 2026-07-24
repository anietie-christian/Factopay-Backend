// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/**
 * Service to record an immutable audit trail of all admin actions.
 * Every privileged operation (KYC approval, user suspension, role change, etc.)
 * must call this service to ensure regulatory compliance and traceability.
 */
@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Logs an admin action to the audit trail.
   *
   * @param adminId   - UUID of the admin user performing the action
   * @param action    - Action identifier (e.g. 'KYC_APPROVED', 'USER_SUSPENDED', 'ROLE_CHANGED')
   * @param targetType - Entity type being acted upon ('USER', 'TRANSFER', 'WALLET')
   * @param targetId  - UUID of the entity being acted upon
   * @param metadata  - Additional context (reason, previous value, new value, etc.)
   * @param ipAddress - IP address of the admin making the request
   */
  async log(
    adminId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata: Record<string, any> | null,
    ipAddress: string,
  ): Promise<void> {
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action,
        targetType,
        targetId,
        metadata: metadata ?? undefined,
        ipAddress,
      },
    });
  }

  /**
   * Retrieves a paginated list of audit log entries with optional filters.
   */
  async findMany(filters: {
    adminId?: string;
    action?: string;
    targetType?: string;
    startDate?: Date;
    endDate?: Date;
    page: number;
    limit: number;
  }) {
    const where: any = {};

    if (filters.adminId) {
      where.adminId = filters.adminId;
    }

    if (filters.action) {
      where.action = filters.action;
    }

    if (filters.targetType) {
      where.targetType = filters.targetType;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const [data, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);

    return {
      data,
      meta: {
        totalItems: total,
        itemsPerPage: filters.limit,
        totalPages: Math.ceil(total / filters.limit),
        currentPage: filters.page,
      },
    };
  }
}
