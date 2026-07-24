// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Test, TestingModule } from '@nestjs/testing';
import { GetComplianceMetricsUseCase } from '../application/use-cases/get-compliance-metrics.use-case';
import { ReviewAlertUseCase } from '../application/use-cases/review-alert.use-case';
import { ListAlertsUseCase } from '../application/use-cases/list-alerts.use-case';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { AdminAuditService } from '../../shared/infrastructure/services/admin-audit.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('Audit & Compliance Module Use Cases', () => {
  let getMetricsUseCase: GetComplianceMetricsUseCase;
  let reviewAlertUseCase: ReviewAlertUseCase;
  let listAlertsUseCase: ListAlertsUseCase;

  let mockPrisma: any;
  let mockAdminAuditService: any;

  beforeEach(async () => {
    mockPrisma = {
      user: {
        count: jest.fn(),
      },
      kycDocument: {
        count: jest.fn(),
      },
      alertRecord: {
        count: jest.fn(),
        groupBy: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      transfer: {
        count: jest.fn(),
      },
      blockchainTransaction: {
        count: jest.fn(),
      },
      auditLog: {
        count: jest.fn(),
        findFirst: jest.fn(),
      },
      adminAuditLog: {
        count: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    mockAdminAuditService = {
      log: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetComplianceMetricsUseCase,
        ReviewAlertUseCase,
        ListAlertsUseCase,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AdminAuditService, useValue: mockAdminAuditService },
      ],
    }).compile();

    getMetricsUseCase = module.get<GetComplianceMetricsUseCase>(GetComplianceMetricsUseCase);
    reviewAlertUseCase = module.get<ReviewAlertUseCase>(ReviewAlertUseCase);
    listAlertsUseCase = module.get<ListAlertsUseCase>(ListAlertsUseCase);
  });

  describe('GetComplianceMetricsUseCase', () => {
    it('should aggregate and calculate correct compliance metrics', async () => {
      // Mock KYC counts
      mockPrisma.user.count.mockImplementation((params) => {
        if (params?.where?.kycStatus === 'APPROVED') return Promise.resolve(40);
        return Promise.resolve(100); // total users
      });
      mockPrisma.kycDocument.count.mockImplementation((params) => {
        if (params?.where?.status === 'APPROVED') return Promise.resolve(30);
        return Promise.resolve(50); // total docs
      });

      // Mock Alerts
      mockPrisma.alertRecord.count.mockImplementation((params) => {
        if (params?.where?.reviewed === false) return Promise.resolve(5);
        if (params?.where?.reviewed === true) return Promise.resolve(15);
        return Promise.resolve(20);
      });
      mockPrisma.alertRecord.groupBy.mockResolvedValue([
        { severity: 'HIGH', _count: { id: 10 } },
        { severity: 'CRITICAL', _count: { id: 10 } },
      ]);

      // Mock Transaction Counts
      mockPrisma.transfer.count.mockImplementation((params) => {
        if (params?.where?.status === 'COMPLETED') return Promise.resolve(200);
        return Promise.resolve(250);
      });
      mockPrisma.blockchainTransaction.count.mockResolvedValue(180);

      // Mock Audits
      mockPrisma.auditLog.count.mockResolvedValue(1000);
      mockPrisma.adminAuditLog.count.mockResolvedValue(150);
      mockPrisma.auditLog.findFirst.mockResolvedValue({ createdAt: new Date('2026-07-13T10:00:00Z') });
      mockPrisma.adminAuditLog.findFirst.mockResolvedValue({ createdAt: new Date('2026-07-13T11:00:00Z') });

      const metrics = await getMetricsUseCase.execute();

      expect(metrics.verificationRate.userVerificationPercentage).toBe(40.0);
      expect(metrics.verificationRate.documentApprovalPercentage).toBe(60.0);
      expect(metrics.amlAlerts.total).toBe(20);
      expect(metrics.amlAlerts.open).toBe(5);
      expect(metrics.amlAlerts.reviewed).toBe(15);
      expect(metrics.amlAlerts.bySeverity.HIGH).toBe(10);
      expect(metrics.amlAlerts.bySeverity.CRITICAL).toBe(10);
      expect(metrics.transactionsScreened.completedTransfers).toBe(200);
      expect(metrics.transactionsScreened.blockchainTransactions).toBe(180);
      expect(metrics.auditStatus.systemAuditLogsCount).toBe(1000);
      expect(metrics.auditStatus.adminAuditLogsCount).toBe(150);
    });
  });

  describe('ListAlertsUseCase', () => {
    it('should retrieve a paginated list of alerts', async () => {
      const mockAlerts = [
        { id: 'alert-1', ruleName: 'HIGH_VALUE_TRANSFER', severity: 'HIGH', status: 'OPEN', reviewed: false },
        { id: 'alert-2', ruleName: 'LEDGER_REVERSAL_TRIGGERED', severity: 'CRITICAL', status: 'OPEN', reviewed: false },
      ];
      mockPrisma.alertRecord.findMany.mockResolvedValue(mockAlerts);
      mockPrisma.alertRecord.count.mockResolvedValue(2);

      const result = await listAlertsUseCase.execute({ page: 1, limit: 10 });

      expect(result.data).toEqual(mockAlerts);
      expect(result.meta.totalItems).toBe(2);
      expect(result.meta.currentPage).toBe(1);
    });
  });

  describe('ReviewAlertUseCase', () => {
    const adminId = 'admin-uuid';
    const ipAddress = '192.168.1.1';

    it('should throw NotFoundException if alert does not exist', async () => {
      mockPrisma.alertRecord.findUnique.mockResolvedValue(null);

      await expect(
        reviewAlertUseCase.execute('invalid-id', adminId, ipAddress),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if alert has already been reviewed', async () => {
      mockPrisma.alertRecord.findUnique.mockResolvedValue({
        id: 'alert-1',
        reviewed: true,
      });

      await expect(
        reviewAlertUseCase.execute('alert-1', adminId, ipAddress),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully mark alert as reviewed and write to admin audit log', async () => {
      const alertData = {
        id: 'alert-1',
        ruleName: 'HIGH_VALUE_TRANSFER',
        severity: 'HIGH',
        targetId: 'transfer-1',
        targetType: 'TRANSFER',
        reviewed: false,
      };
      mockPrisma.alertRecord.findUnique.mockResolvedValue(alertData);
      mockPrisma.alertRecord.update.mockResolvedValue({
        ...alertData,
        reviewed: true,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        status: 'RESOLVED',
      });

      const result = await reviewAlertUseCase.execute('alert-1', adminId, ipAddress);

      expect(result.reviewed).toBe(true);
      expect(result.status).toBe('RESOLVED');
      expect(mockPrisma.alertRecord.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: expect.objectContaining({
          reviewed: true,
          reviewedBy: adminId,
          status: 'RESOLVED',
        }),
      });
      expect(mockAdminAuditService.log).toHaveBeenCalledWith(
        adminId,
        'AML_ALERT_REVIEWED',
        'ALERT',
        'alert-1',
        {
          ruleName: 'HIGH_VALUE_TRANSFER',
          severity: 'HIGH',
          targetId: 'transfer-1',
          targetType: 'TRANSFER',
        },
        ipAddress,
      );
    });
  });
});
