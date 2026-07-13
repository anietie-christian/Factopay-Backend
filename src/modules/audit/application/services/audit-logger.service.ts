import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';

export interface AuditLogParams {
  userId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
}

@Injectable()
export class AuditLoggerService {
  private readonly logger = new Logger(AuditLoggerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logAction(params: AuditLogParams): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: params.userId,
          action: params.action,
          targetType: params.targetType,
          targetId: params.targetId,
          metadata: params.metadata ? (params.metadata as any) : undefined,
          ipAddress: params.ipAddress,
        },
      });
      
      this.logger.log(`Audit log created for action: ${params.action}`);
    } catch (error) {
      // We don't want audit logging to block critical flows, so we just log the error here.
      this.logger.error(`Failed to create audit log for action: ${params.action}`, error instanceof Error ? error.stack : String(error));
    }
  }
}
