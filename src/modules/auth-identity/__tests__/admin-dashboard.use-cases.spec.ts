import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { AdminAuditService } from '../../shared/infrastructure/services/admin-audit.service';
import { AdminDashboardOverviewUseCase } from '../application/use-cases/admin-dashboard-overview.use-case';
import { AdminGetAuditLogUseCase } from '../application/use-cases/admin-get-audit-log.use-case';

describe('Admin Dashboard and Ops Use Cases', () => {
  let overviewUseCase: AdminDashboardOverviewUseCase;
  let getAuditLogUseCase: AdminGetAuditLogUseCase;

  let mockPrismaService: any;
  let mockAdminAuditService: any;

  beforeEach(async () => {
    mockPrismaService = {
      user: {
        count: jest.fn(),
      },
    };

    mockAdminAuditService = {
      findMany: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminDashboardOverviewUseCase,
        AdminGetAuditLogUseCase,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: AdminAuditService,
          useValue: mockAdminAuditService,
        },
      ],
    }).compile();

    overviewUseCase = module.get<AdminDashboardOverviewUseCase>(AdminDashboardOverviewUseCase);
    getAuditLogUseCase = module.get<AdminGetAuditLogUseCase>(AdminGetAuditLogUseCase);
  });

  describe('AdminDashboardOverviewUseCase', () => {
    it('should aggregate counts correctly from the database', async () => {
      mockPrismaService.user.count
        .mockResolvedValueOnce(100)  // totalUsers
        .mockResolvedValueOnce(5)    // pendingKyc
        .mockResolvedValueOnce(80)   // activeUsers30d
        .mockResolvedValueOnce(2)    // suspendedUsers
        .mockResolvedValueOnce(12);  // newRegistrations7d

      const result = await overviewUseCase.execute();

      expect(result.stats.totalUsers).toBe(100);
      expect(result.stats.pendingKyc).toBe(5);
      expect(result.stats.activeUsers30d).toBe(80);
      expect(result.stats.suspendedUsers).toBe(2);
      expect(result.stats.newRegistrations7d).toBe(12);
      expect(mockPrismaService.user.count).toHaveBeenCalledTimes(5);
    });
  });

  describe('AdminGetAuditLogUseCase', () => {
    it('should query the audit service with filters', async () => {
      const mockResult = {
        data: [{ id: 'log-1', action: 'KYC_APPROVED' }],
        meta: { totalItems: 1 },
      };
      mockAdminAuditService.findMany.mockResolvedValue(mockResult);

      const query = { page: 1, limit: 10, action: 'KYC_APPROVED' };
      const result = await getAuditLogUseCase.execute(query);

      expect(mockAdminAuditService.findMany).toHaveBeenCalledWith({
        adminId: undefined,
        action: 'KYC_APPROVED',
        targetType: undefined,
        startDate: undefined,
        endDate: undefined,
        page: 1,
        limit: 10,
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].action).toBe('KYC_APPROVED');
    });
  });
});
