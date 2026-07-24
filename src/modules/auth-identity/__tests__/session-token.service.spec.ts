// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { KycStatus, Role } from '../domain/models/user.model';
import { SessionTokenService } from '../infrastructure/security/session-token.service';

describe('SessionTokenService', () => {
  let service: SessionTokenService;
  let jwtService: JwtService;
  let prisma: any;

  const user = {
    id: 'c75fd597-8baf-43c9-9c52-f421786e9570',
    email: 'user@example.com',
    role: Role.USER,
    kycStatus: KycStatus.APPROVED,
  };

  const context = {
    fingerprint: 'fingerprint-1',
    ipAddress: '192.168.1.15',
    userAgent: 'Jest/1.0',
  };

  beforeEach(() => {
    jwtService = new JwtService({ secret: 'test-jwt-secret-32-characters-minimum' });
    prisma = {
      authSession: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };
    service = new SessionTokenService(jwtService, prisma);
  });

  function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  it('creates a persisted refresh session with a hashed token', async () => {
    const result = await service.issueTokens(user, context);
    const refreshPayload: any = jwtService.verify(result.refreshToken);

    expect(refreshPayload).toMatchObject({
      sub: user.id,
      email: user.email,
      typ: 'refresh',
      fpt: context.fingerprint,
    });
    expect(prisma.authSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: refreshPayload.jti,
        userId: user.id,
        refreshTokenHash: hashToken(result.refreshToken),
        deviceFingerprint: context.fingerprint,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      }),
    });
  });

  it('rotates a valid refresh token and revokes the previous session atomically', async () => {
    const issued = await service.issueTokens(user, context);
    const payload: any = jwtService.verify(issued.refreshToken);

    prisma.authSession.findUnique.mockResolvedValue({
      id: payload.jti,
      userId: user.id,
      refreshTokenHash: hashToken(issued.refreshToken),
      deviceFingerprint: context.fingerprint,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.authSession.create.mockClear();

    const rotated = await service.rotateRefreshToken(issued.refreshToken, payload, user, context);
    const rotatedPayload: any = jwtService.verify(rotated.refreshToken);

    expect(rotatedPayload.jti).not.toBe(payload.jti);
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: payload.jti,
        userId: user.id,
        refreshTokenHash: hashToken(issued.refreshToken),
        isRevoked: false,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { isRevoked: true },
    });
    expect(prisma.authSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: rotatedPayload.jti,
        userId: user.id,
        refreshTokenHash: hashToken(rotated.refreshToken),
        deviceFingerprint: context.fingerprint,
      }),
    });
  });

  it('revokes all active sessions when a revoked refresh token is reused', async () => {
    const issued = await service.issueTokens(user, context);
    const payload: any = jwtService.verify(issued.refreshToken);

    prisma.authSession.findUnique.mockResolvedValue({
      id: payload.jti,
      userId: user.id,
      refreshTokenHash: hashToken(issued.refreshToken),
      deviceFingerprint: context.fingerprint,
      isRevoked: true,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.rotateRefreshToken(issued.refreshToken, payload, user, context),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, isRevoked: false },
      data: { isRevoked: true },
    });
  });

  it('rejects a refresh token whose hash does not match the stored session', async () => {
    const issued = await service.issueTokens(user, context);
    const payload: any = jwtService.verify(issued.refreshToken);

    prisma.authSession.findUnique.mockResolvedValue({
      id: payload.jti,
      userId: user.id,
      refreshTokenHash: hashToken('different-token'),
      deviceFingerprint: context.fingerprint,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.rotateRefreshToken(issued.refreshToken, payload, user, context),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, isRevoked: false },
      data: { isRevoked: true },
    });
  });
});
