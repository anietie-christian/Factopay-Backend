import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { AdminAuditService } from '../../shared/infrastructure/services/admin-audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AdminGetKycQueueUseCase } from '../application/use-cases/admin-get-kyc-queue.use-case';
import { AdminGetKycDetailsUseCase } from '../application/use-cases/admin-get-kyc-details.use-case';
import { AdminApproveKycUseCase } from '../application/use-cases/admin-approve-kyc.use-case';
import { AdminRejectKycUseCase } from '../application/use-cases/admin-reject-kyc.use-case';
import { AdminRequestResubmissionUseCase } from '../application/use-cases/admin-request-resubmission.use-case';
import { AdminUpgradeKycTierUseCase } from '../application/use-cases/admin-upgrade-kyc-tier.use-case';

describe('Admin KYC Use Cases', () => {
  let getQueueUseCase: AdminGetKycQueueUseCase;
  let getDetailsUseCase: AdminGetKycDetailsUseCase;
  let approveUseCase: AdminApproveKycUseCase;
  let rejectUseCase: AdminRejectKycUseCase;
  let requestResubmissionUseCase: AdminRequestResubmissionUseCase;
  let upgradeTierUseCase: AdminUpgradeKycTierUseCase;

  let mockPrismaService: any;
  let mockAdminAuditService: any;

  const mockUser = {
    id: 'user-123',
    email: 'user@example.com',
    phoneNumber: '+1234567890',
    kycStatus: 'PENDING',
    kycTier: 'NONE',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockPrismaService = {
      user: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      kycVerificationAttempt: {
        create: jest.fn(),
      },
    };

    mockAdminAuditService = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminGetKycQueueUseCase,
        AdminGetKycDetailsUseCase,
        AdminApproveKycUseCase,
        AdminRejectKycUseCase,
        AdminRequestResubmissionUseCase,
        AdminUpgradeKycTierUseCase,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: AdminAuditService,
          useValue: mockAdminAuditService,
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    getQueueUseCase = module.get<AdminGetKycQueueUseCase>(AdminGetKycQueueUseCase);
    getDetailsUseCase = module.get<AdminGetKycDetailsUseCase>(AdminGetKycDetailsUseCase);
    approveUseCase = module.get<AdminApproveKycUseCase>(AdminApproveKycUseCase);
    rejectUseCase = module.get<AdminRejectKycUseCase>(AdminRejectKycUseCase);
    requestResubmissionUseCase = module.get<AdminRequestResubmissionUseCase>(AdminRequestResubmissionUseCase);
    upgradeTierUseCase = module.get<AdminUpgradeKycTierUseCase>(AdminUpgradeKycTierUseCase);
  });

  describe('AdminGetKycQueueUseCase', () => {
    it('should return a list of users pending review with metadata', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([
        {
          id: 'user-123',
          email: 'user@example.com',
          kycStatus: 'PENDING',
          kycTier: 'NONE',
          updatedAt: new Date(),
          profile: {
            firstName: 'John',
            lastName: 'Doe',
            countryOfResidence: 'GHA',
          },
          kycDocuments: [{ id: 'doc-1', documentType: 'GOVERNMENT_ID', status: 'PENDING', createdAt: new Date() }],
        },
      ]);
      mockPrismaService.user.count.mockResolvedValue(1);

      const result = await getQueueUseCase.execute({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].email).toBe('user@example.com');
      expect(result.meta.totalItems).toBe(1);
    });
  });

  describe('AdminGetKycDetailsUseCase', () => {
    it('should throw NotFoundException if user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(getDetailsUseCase.execute('non-existent-user')).rejects.toThrow(NotFoundException);
    });

    it('should return full profile, documents and attempts for a valid user', async () => {
      const fullMockUser = {
        ...mockUser,
        profile: { firstName: 'John', lastName: 'Doe' },
        kycDocuments: [],
        kycAttempts: [],
      };
      mockPrismaService.user.findUnique.mockResolvedValue(fullMockUser);

      const result = await getDetailsUseCase.execute('user-123');
      expect(result.userId).toBe('user-123');
      expect(result.profile?.firstName).toBe('John');
    });
  });

  describe('AdminApproveKycUseCase', () => {
    it('should manually approve user, write attempt log and audit log', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        kycStatus: 'APPROVED',
        kycTier: 'TIER_1',
      });

      const result = await approveUseCase.execute('user-123', 'admin-id', 'admin@example.com', '127.0.0.1');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { kycStatus: 'APPROVED', kycTier: 'TIER_1' },
      });
      expect(mockPrismaService.kycVerificationAttempt.create).toHaveBeenCalled();
      expect(mockAdminAuditService.log).toHaveBeenCalledWith(
        'admin-id',
        'KYC_APPROVED',
        'USER',
        'user-123',
        expect.any(Object),
        '127.0.0.1',
      );
      expect(result.kycStatus).toBe('APPROVED');
    });

    it('should throw BadRequestException if user is already approved', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ ...mockUser, kycStatus: 'APPROVED' });
      await expect(
        approveUseCase.execute('user-123', 'admin-id', 'admin@example.com', '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('AdminRejectKycUseCase', () => {
    it('should reject user, save attempt, and register audit log', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        kycStatus: 'REJECTED',
        kycTier: 'NONE',
      });

      const result = await rejectUseCase.execute(
        'user-123',
        { reason: 'Document fuzzy' },
        'admin-id',
        'admin@example.com',
        '127.0.0.1',
      );

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { kycStatus: 'REJECTED', kycTier: 'NONE' },
      });
      expect(mockPrismaService.kycVerificationAttempt.create).toHaveBeenCalled();
      expect(mockAdminAuditService.log).toHaveBeenCalledWith(
        'admin-id',
        'KYC_REJECTED',
        'USER',
        'user-123',
        expect.any(Object),
        '127.0.0.1',
      );
      expect(result.kycStatus).toBe('REJECTED');
    });
  });

  describe('AdminRequestResubmissionUseCase', () => {
    it('should update user to RESUBMISSION_REQUIRED if user is currently PENDING or REJECTED', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        kycStatus: 'RESUBMISSION_REQUIRED',
      });

      const result = await requestResubmissionUseCase.execute(
        'user-123',
        { message: 'Provide clear selfie' },
        'admin-id',
        '127.0.0.1',
      );

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { kycStatus: 'RESUBMISSION_REQUIRED' },
      });
      expect(result.kycStatus).toBe('RESUBMISSION_REQUIRED');
    });

    it('should throw BadRequestException if user status is already APPROVED', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ ...mockUser, kycStatus: 'APPROVED' });
      await expect(
        requestResubmissionUseCase.execute('user-123', { message: 'Fuzzy document' }, 'admin-id', '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('AdminUpgradeKycTierUseCase', () => {
    it('should allow tier upgrade for approved user if new tier is higher', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ ...mockUser, kycStatus: 'APPROVED', kycTier: 'TIER_1' });
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        kycStatus: 'APPROVED',
        kycTier: 'TIER_2',
      });

      const result = await upgradeTierUseCase.execute(
        'user-123',
        { newTier: 'TIER_2', reason: 'High wealth user' },
        'admin-id',
        '127.0.0.1',
      );

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { kycTier: 'TIER_2' },
      });
      expect(result.kycTier).toBe('TIER_2');
    });

    it('should throw BadRequestException if user is not APPROVED', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ ...mockUser, kycStatus: 'PENDING', kycTier: 'NONE' });
      await expect(
        upgradeTierUseCase.execute(
          'user-123',
          { newTier: 'TIER_2', reason: 'High wealth user' },
          'admin-id',
          '127.0.0.1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if upgrading to a lower or equal tier', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ ...mockUser, kycStatus: 'APPROVED', kycTier: 'TIER_2' });
      await expect(
        upgradeTierUseCase.execute(
          'user-123',
          { newTier: 'TIER_1', reason: 'High wealth user' },
          'admin-id',
          '127.0.0.1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
