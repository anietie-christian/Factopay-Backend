// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { LogoutUseCase } from '../application/use-cases/logout.use-case';
import { LogoutAllUseCase } from '../application/use-cases/logout-all.use-case';
import { ListSessionsUseCase } from '../application/use-cases/list-sessions.use-case';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';

describe('Session Management (Logout & List)', () => {
  let logoutUseCase: LogoutUseCase;
  let logoutAllUseCase: LogoutAllUseCase;
  let listSessionsUseCase: ListSessionsUseCase;
  let prisma: Record<string, any>;
  let jwtService: JwtService;

  const userId = 'user-001';
  const sessionId = 'session-001';

  beforeEach(async () => {
    prisma = {
      authSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: sessionId,
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
            createdAt: new Date('2026-07-16T10:00:00Z'),
            expiresAt: new Date('2026-07-23T10:00:00Z'),
          },
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogoutUseCase,
        LogoutAllUseCase,
        ListSessionsUseCase,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: {
            decode: jest.fn().mockReturnValue({ jti: sessionId, typ: 'refresh', sub: userId }),
          },
        },
      ],
    }).compile();

    logoutUseCase = module.get(LogoutUseCase);
    logoutAllUseCase = module.get(LogoutAllUseCase);
    listSessionsUseCase = module.get(ListSessionsUseCase);
    jwtService = module.get(JwtService);
  });

  describe('LogoutUseCase', () => {
    it('should revoke the session identified by the refresh token jti', async () => {
      const result = await logoutUseCase.execute(userId, 'fake-refresh-token');

      expect(jwtService.decode).toHaveBeenCalledWith('fake-refresh-token');
      expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
        where: { id: sessionId, userId, isRevoked: false },
        data: { isRevoked: true },
      });
      expect(result).toEqual({ message: 'Logged out' });
    });

    it('should return success even if the token is malformed', async () => {
      (jwtService.decode as jest.Mock).mockImplementation(() => {
        throw new Error('malformed');
      });

      const result = await logoutUseCase.execute(userId, 'garbage');
      expect(result).toEqual({ message: 'Logged out' });
      expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
    });

    it('should return success if the token has no jti', async () => {
      (jwtService.decode as jest.Mock).mockReturnValue({ sub: userId });

      const result = await logoutUseCase.execute(userId, 'no-jti-token');
      expect(result).toEqual({ message: 'Logged out' });
      expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
    });

    it('should be idempotent — revoking an already-revoked token is fine', async () => {
      prisma.authSession.updateMany.mockResolvedValue({ count: 0 });

      const result = await logoutUseCase.execute(userId, 'already-revoked-token');
      expect(result).toEqual({ message: 'Logged out' });
    });
  });

  describe('LogoutAllUseCase', () => {
    it('should revoke all active sessions for the user', async () => {
      prisma.authSession.updateMany.mockResolvedValue({ count: 3 });

      const result = await logoutAllUseCase.execute(userId);

      expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
        where: { userId, isRevoked: false },
        data: { isRevoked: true },
      });
      expect(result).toEqual({ message: 'All sessions revoked', revokedCount: 3 });
    });

    it('should return zero if the user has no active sessions', async () => {
      prisma.authSession.updateMany.mockResolvedValue({ count: 0 });

      const result = await logoutAllUseCase.execute(userId);
      expect(result.revokedCount).toBe(0);
    });
  });

  describe('ListSessionsUseCase', () => {
    it('should return only non-revoked, non-expired sessions', async () => {
      const sessions = await listSessionsUseCase.execute(userId);

      expect(prisma.authSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId,
            isRevoked: false,
            expiresAt: { gt: expect.any(Date) },
          },
          select: {
            id: true,
            ipAddress: true,
            userAgent: true,
            createdAt: true,
            expiresAt: true,
          },
        }),
      );
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe(sessionId);
    });

    it('should never expose refreshTokenHash or deviceFingerprint', async () => {
      const sessions = await listSessionsUseCase.execute(userId);

      for (const session of sessions) {
        expect(session).not.toHaveProperty('refreshTokenHash');
        expect(session).not.toHaveProperty('deviceFingerprint');
      }
    });
  });
});
