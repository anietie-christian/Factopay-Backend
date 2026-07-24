// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';

@Injectable()
export class GetComplianceMetricsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute() {
    // 1. Verification Rate
    const totalUsers = await this.prisma.user.count();
    const verifiedUsers = await this.prisma.user.count({
      where: { kycStatus: 'APPROVED' },
    });
    const verificationRate = totalUsers > 0 ? (verifiedUsers / totalUsers) * 100 : 0;

    const totalDocs = await this.prisma.kycDocument.count();
    const approvedDocs = await this.prisma.kycDocument.count({
      where: { status: 'APPROVED' },
    });
    const docApprovalRate = totalDocs > 0 ? (approvedDocs / totalDocs) * 100 : 0;

    // 2. AML Alert Count
    const totalAlerts = await this.prisma.alertRecord.count();
    const openAlerts = await this.prisma.alertRecord.count({
      where: { reviewed: false },
    });
    const reviewedAlerts = await this.prisma.alertRecord.count({
      where: { reviewed: true },
    });

    const alertsBySeverityRaw = await this.prisma.alertRecord.groupBy({
      by: ['severity'],
      _count: { id: true },
    });
    const alertsBySeverity = alertsBySeverityRaw.reduce((acc, curr) => {
      acc[curr.severity] = curr._count.id;
      return acc;
    }, {} as Record<string, number>);

    // 3. Transactions Screened
    // AmlRuleEngineService screens every completed transfer
    const completedTransfers = await this.prisma.transfer.count({
      where: { status: 'COMPLETED' },
    });
    const totalTransfers = await this.prisma.transfer.count();
    const blockchainTxs = await this.prisma.blockchainTransaction.count();

    // 4. Audit Status
    const totalAuditLogs = await this.prisma.auditLog.count();
    const totalAdminAuditLogs = await this.prisma.adminAuditLog.count();
    const lastAuditLog = await this.prisma.auditLog.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const lastAdminAuditLog = await this.prisma.adminAuditLog.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    return {
      verificationRate: {
        totalUsers,
        verifiedUsers,
        userVerificationPercentage: parseFloat(verificationRate.toFixed(2)),
        totalDocuments: totalDocs,
        approvedDocuments: approvedDocs,
        documentApprovalPercentage: parseFloat(docApprovalRate.toFixed(2)),
      },
      amlAlerts: {
        total: totalAlerts,
        open: openAlerts,
        reviewed: reviewedAlerts,
        bySeverity: {
          LOW: alertsBySeverity['LOW'] || 0,
          MEDIUM: alertsBySeverity['MEDIUM'] || 0,
          HIGH: alertsBySeverity['HIGH'] || 0,
          CRITICAL: alertsBySeverity['CRITICAL'] || 0,
        },
      },
      transactionsScreened: {
        completedTransfers,
        totalTransfers,
        blockchainTransactions: blockchainTxs,
        description: 'All completed transfers undergo automated AML rules engine screening.',
      },
      auditStatus: {
        systemAuditLogsCount: totalAuditLogs,
        adminAuditLogsCount: totalAdminAuditLogs,
        lastSystemAuditAt: lastAuditLog?.createdAt || null,
        lastAdminAuditAt: lastAdminAuditLog?.createdAt || null,
      },
    };
  }
}
