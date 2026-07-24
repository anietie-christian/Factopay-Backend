// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { RequestAccountClosureUseCase } from '../application/use-cases/request-account-closure.use-case';
import { CancelAccountClosureUseCase } from '../application/use-cases/cancel-account-closure.use-case';
import { CompleteAccountClosureUseCase } from '../application/use-cases/complete-account-closure.use-case';
import { LogoutAllUseCase } from '../application/use-cases/logout-all.use-case';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { USER_REPOSITORY_TOKEN } from '../domain/repositories/user-repository.interface';
import { User, Role, KycStatus, UserStatus } from '../domain/models/user.model';

describe('Account Closure Use Cases', () => {
  let requestClosure: RequestAccountClosureUseCase;
  let cancelClosure: CancelAccountClosureUseCase;
  let completeClosure: CompleteAccountClosureUseCase;
  let logoutAll: LogoutAllUseCase;
  let prisma: Record<string, any>;
  let userRepository: Record<string, any>;

  const userId = 'user-001';
  let mockUser: User;

  beforeEach(async () => {
    mockUser = new User(
      userId,
      'test@example.com',
      '+1234567890',
      'password_hash',
      true,
      true,
      KycStatus.APPROVED,
      'TIER_1',
      Role.USER,
      true, // isActive
      null,
      new Date(),
      new Date(),
      true, // isMfaEnabled
      'secret_key',
      ['code1', 'code2'],
      UserStatus.ACTIVE,
    );

    userRepository = {
      findById: jest.fn().mockImplementation((id) => {
        if (id === userId) return Promise.resolve(mockUser);
        return Promise.resolve(null);
      }),
      save: jest.fn().mockImplementation((user) => {
        mockUser = user;
        return Promise.resolve(user);
      }),
    };

    prisma = {
      accountClosureRequest: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
      },
      userProfile: {
        updateMany: jest.fn().mockResolvedValue({}),
      },
      user: {
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    logoutAll = {
      execute: jest.fn().mockResolvedValue({ count: 1 }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestAccountClosureUseCase,
        CancelAccountClosureUseCase,
        CompleteAccountClosureUseCase,
        { provide: LogoutAllUseCase, useValue: logoutAll },
        { provide: PrismaService, useValue: prisma },
        { provide: USER_REPOSITORY_TOKEN, useValue: userRepository },
      ],
    }).compile();

    requestClosure = module.get(RequestAccountClosureUseCase);
    cancelClosure = module.get(CancelAccountClosureUseCase);
    completeClosure = module.get(CompleteAccountClosureUseCase);
  });

  describe('RequestAccountClosureUseCase', () => {
    it('should set status to CLOSURE_REQUESTED, deactivate MFA, call logout-all, and insert pending request', async () => {
      const result = await requestClosure.execute(userId, 'Tired of payments');

      expect(userRepository.findById).toHaveBeenCalledWith(userId);
      expect(mockUser.status).toBe(UserStatus.CLOSURE_REQUESTED);
      expect(mockUser.isActive).toBe(false);
      expect(mockUser.isMfaEnabled).toBe(false);
      expect(mockUser.mfaSecret).toBeNull();
      expect(mockUser.mfaBackupCodes).toEqual([]);
      expect(userRepository.save).toHaveBeenCalledWith(mockUser);

      expect(prisma.accountClosureRequest.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          create: expect.objectContaining({
            userId,
            reason: 'Tired of payments',
            status: 'PENDING',
          }),
        }),
      );

      expect(logoutAll.execute).toHaveBeenCalledWith(userId);
      expect(result.message).toContain('Account closure requested');
      expect(result.coolingOffEnds).toBeInstanceOf(Date);
    });

    it('should reject if account closure is already requested', async () => {
      mockUser.status = UserStatus.CLOSURE_REQUESTED;

      await expect(requestClosure.execute(userId)).rejects.toThrow(BadRequestException);
    });

    it('should reject if account is already closed', async () => {
      mockUser.status = UserStatus.CLOSED;

      await expect(requestClosure.execute(userId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('CancelAccountClosureUseCase', () => {
    it('should restore user to active status if within cooling-off', async () => {
      mockUser.status = UserStatus.CLOSURE_REQUESTED;
      mockUser.isActive = false;

      prisma.accountClosureRequest.findUnique.mockResolvedValue({
        userId,
        status: 'PENDING',
        coolingOffEnds: new Date(Date.now() + 1000000), // in the future
      });

      const result = await cancelClosure.execute(userId);

      expect(mockUser.status).toBe(UserStatus.ACTIVE);
      expect(mockUser.isActive).toBe(true);
      expect(userRepository.save).toHaveBeenCalledWith(mockUser);
      expect(prisma.accountClosureRequest.update).toHaveBeenCalledWith({
        where: { userId },
        data: { status: 'CANCELLED' },
      });
      expect(result.message).toContain('cancelled successfully');
    });

    it('should reject if cooling-off period has passed', async () => {
      mockUser.status = UserStatus.CLOSURE_REQUESTED;
      mockUser.isActive = false;

      prisma.accountClosureRequest.findUnique.mockResolvedValue({
        userId,
        status: 'PENDING',
        coolingOffEnds: new Date(Date.now() - 10000), // in the past
      });

      await expect(cancelClosure.execute(userId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('CompleteAccountClosureUseCase', () => {
    it('should finalise and anonymise user profile', async () => {
      mockUser.status = UserStatus.CLOSURE_REQUESTED;
      mockUser.isActive = false;

      prisma.accountClosureRequest.findUnique.mockResolvedValue({
        userId,
        status: 'PENDING',
      });

      const result = await completeClosure.execute(userId);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.accountClosureRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          data: expect.objectContaining({
            status: 'COMPLETED',
          }),
        }),
      );
      expect(prisma.userProfile.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          data: expect.objectContaining({
            firstName: 'Anonymized',
            lastName: 'User',
          }),
        }),
      );
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: userId },
          data: expect.objectContaining({
            email: expect.stringContaining('deleted-'),
            phoneNumber: null,
            status: 'CLOSED',
          }),
        }),
      );
      expect(result.message).toContain('completed');
    });
  });
});
