import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { AdminAuditService } from '../../shared/infrastructure/services/admin-audit.service';
import { AdminListUsersUseCase } from '../application/use-cases/admin-list-users.use-case';
import { AdminGetUserDetailsUseCase } from '../application/use-cases/admin-get-user-details.use-case';
import { AdminSuspendUserUseCase } from '../application/use-cases/admin-suspend-user.use-case';
import { AdminUnsuspendUserUseCase } from '../application/use-cases/admin-unsuspend-user.use-case';
import { AdminUpdateRoleUseCase } from '../application/use-cases/admin-update-role.use-case';

describe('Admin Users Use Cases', () => {
  let listUsersUseCase: AdminListUsersUseCase;
  let getUserDetailsUseCase: AdminGetUserDetailsUseCase;
  let suspendUserUseCase: AdminSuspendUserUseCase;
  let unsuspendUserUseCase: AdminUnsuspendUserUseCase;
  let updateRoleUseCase: AdminUpdateRoleUseCase;

  let mockPrismaService: any;
  let mockAdminAuditService: any;

  const mockUser = {
    id: 'user-123',
    email: 'user@example.com',
    phoneNumber: '+1234567890',
    kycStatus: 'PENDING',
    kycTier: 'NONE',
    role: 'USER',
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
      authSession: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((promises) => Promise.all(promises)),
    };

    mockAdminAuditService = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminListUsersUseCase,
        AdminGetUserDetailsUseCase,
        AdminSuspendUserUseCase,
        AdminUnsuspendUserUseCase,
        AdminUpdateRoleUseCase,
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

    listUsersUseCase = module.get<AdminListUsersUseCase>(AdminListUsersUseCase);
    getUserDetailsUseCase = module.get<AdminGetUserDetailsUseCase>(AdminGetUserDetailsUseCase);
    suspendUserUseCase = module.get<AdminSuspendUserUseCase>(AdminSuspendUserUseCase);
    unsuspendUserUseCase = module.get<AdminUnsuspendUserUseCase>(AdminUnsuspendUserUseCase);
    updateRoleUseCase = module.get<AdminUpdateRoleUseCase>(AdminUpdateRoleUseCase);
  });

  describe('AdminListUsersUseCase', () => {
    it('should return a paginated list of users', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([
        {
          ...mockUser,
          profile: { firstName: 'John', lastName: 'Doe', countryOfResidence: 'GHA' },
        },
      ]);
      mockPrismaService.user.count.mockResolvedValue(1);

      const result = await listUsersUseCase.execute({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].email).toBe('user@example.com');
      expect(result.data[0].name).toBe('John Doe');
      expect(result.meta.totalItems).toBe(1);
    });
  });

  describe('AdminGetUserDetailsUseCase', () => {
    it('should throw NotFoundException if user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(getUserDetailsUseCase.execute('non-existent-user')).rejects.toThrow(NotFoundException);
    });

    it('should return full details including sessions for a valid user', async () => {
      const fullMockUser = {
        ...mockUser,
        isEmailVerified: true,
        isPhoneVerified: true,
        profile: { firstName: 'John', lastName: 'Doe' },
        socialAccounts: [],
        sessions: [{ id: 'sess-1', ipAddress: '127.0.0.1', isRevoked: false, createdAt: new Date() }],
      };
      mockPrismaService.user.findUnique.mockResolvedValue(fullMockUser);

      const result = await getUserDetailsUseCase.execute('user-123');
      expect(result.userId).toBe('user-123');
      expect(result.recentSessions).toHaveLength(1);
    });
  });

  describe('AdminSuspendUserUseCase', () => {
    it('should deactivate user, revoke all sessions, and log audit trail', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await suspendUserUseCase.execute(
        'user-123',
        { reason: 'Suspicious card usage' },
        'admin-id',
        '127.0.0.1',
      );

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { isActive: false },
      });
      expect(mockPrismaService.authSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-123', isRevoked: false },
        data: { isRevoked: true },
      });
      expect(mockAdminAuditService.log).toHaveBeenCalledWith(
        'admin-id',
        'USER_SUSPENDED',
        'USER',
        'user-123',
        { reason: 'Suspicious card usage' },
        '127.0.0.1',
      );
      expect(result.isActive).toBe(false);
    });

    it('should throw BadRequestException when admin tries to suspend themselves', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ ...mockUser, id: 'admin-id' });
      await expect(
        suspendUserUseCase.execute('admin-id', { reason: 'test' }, 'admin-id', '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if user is already suspended', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });
      await expect(
        suspendUserUseCase.execute('user-123', { reason: 'test' }, 'admin-id', '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('AdminUnsuspendUserUseCase', () => {
    it('should activate user and log audit trail', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });
      mockPrismaService.user.update.mockResolvedValue({ ...mockUser, isActive: true });

      const result = await unsuspendUserUseCase.execute('user-123', 'admin-id', '127.0.0.1');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { isActive: true },
      });
      expect(mockAdminAuditService.log).toHaveBeenCalledWith(
        'admin-id',
        'USER_UNSUSPENDED',
        'USER',
        'user-123',
        null,
        '127.0.0.1',
      );
      expect(result.isActive).toBe(true);
    });

    it('should throw BadRequestException if user is already active', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      await expect(unsuspendUserUseCase.execute('user-123', 'admin-id', '127.0.0.1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('AdminUpdateRoleUseCase', () => {
    it('should update user role and log audit trail', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({ ...mockUser, role: 'SUPPORT' });

      const result = await updateRoleUseCase.execute('user-123', { role: 'SUPPORT' }, 'admin-id', '127.0.0.1');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { role: 'SUPPORT' },
      });
      expect(mockAdminAuditService.log).toHaveBeenCalledWith(
        'admin-id',
        'ROLE_CHANGED',
        'USER',
        'user-123',
        { previousRole: 'USER', newRole: 'SUPPORT' },
        '127.0.0.1',
      );
      expect(result.role).toBe('SUPPORT');
    });

    it('should throw BadRequestException when changing your own role', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ ...mockUser, id: 'admin-id' });
      await expect(
        updateRoleUseCase.execute('admin-id', { role: 'SUPPORT' }, 'admin-id', '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when target user is SUPERADMIN', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ ...mockUser, role: 'SUPERADMIN' });
      await expect(
        updateRoleUseCase.execute('user-123', { role: 'SUPPORT' }, 'admin-id', '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
