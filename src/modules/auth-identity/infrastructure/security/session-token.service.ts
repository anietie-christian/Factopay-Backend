// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { User } from '../../domain/models/user.model';
import { JwtPayload } from '../strategy/jwt.strategy';

export interface SessionContext {
  fingerprint?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

type TokenUser = Pick<User, 'id' | 'email' | 'role' | 'kycStatus'>;

@Injectable()
export class SessionTokenService {
  private static readonly ACCESS_TOKEN_TTL = '15m';
  private static readonly REFRESH_TOKEN_TTL = '7d';
  private static readonly REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  static normalizeContext(context?: SessionContext | string): SessionContext {
    if (!context) {
      return {};
    }

    if (typeof context === 'string') {
      return { fingerprint: context };
    }

    return context;
  }

  async issueTokens(user: TokenUser, context?: SessionContext | string): Promise<SessionTokens> {
    const normalizedContext = SessionTokenService.normalizeContext(context);
    const payload = this.buildAccessPayload(user, normalizedContext);
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: SessionTokenService.ACCESS_TOKEN_TTL,
    });
    const refreshToken = await this.createRefreshSession(user.id, payload, normalizedContext);

    return { accessToken, refreshToken };
  }

  async rotateRefreshToken(
    refreshToken: string,
    payload: JwtPayload,
    user: TokenUser,
    context?: SessionContext | string,
  ): Promise<SessionTokens> {
    const normalizedContext = SessionTokenService.normalizeContext(context);

    if (!payload.jti || payload.typ !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    this.assertFingerprint(payload, normalizedContext);

    const session = await this.prisma.authSession.findUnique({
      where: { id: payload.jti },
    });

    if (!session || session.userId !== user.id) {
      throw new UnauthorizedException('Refresh session not found');
    }

    if (session.isRevoked) {
      await this.revokeAllUserSessions(user.id);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (session.expiresAt <= new Date()) {
      await this.revokeSession(session.id);
      throw new UnauthorizedException('Refresh token has expired');
    }

    if (session.deviceFingerprint && session.deviceFingerprint !== normalizedContext.fingerprint) {
      await this.revokeAllUserSessions(user.id);
      throw new UnauthorizedException('Token binding mismatch');
    }

    const tokenHash = this.hashToken(refreshToken);
    if (!this.timingSafeEqual(session.refreshTokenHash, tokenHash)) {
      await this.revokeAllUserSessions(user.id);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const nextPayload = this.buildAccessPayload(user, normalizedContext);
    const accessToken = this.jwtService.sign(nextPayload, {
      expiresIn: SessionTokenService.ACCESS_TOKEN_TTL,
    });
    const nextSessionId = crypto.randomUUID();
    const nextRefreshToken = this.signRefreshToken(nextPayload, nextSessionId);
    const nextRefreshTokenHash = this.hashToken(nextRefreshToken);
    const expiresAt = this.getRefreshExpiry();
    const now = new Date();

    const rotated = await this.prisma.$transaction(async (tx) => {
      const revokeResult = await tx.authSession.updateMany({
        where: {
          id: session.id,
          userId: user.id,
          refreshTokenHash: tokenHash,
          isRevoked: false,
          expiresAt: { gt: now },
        },
        data: { isRevoked: true },
      });

      if (revokeResult.count !== 1) {
        return false;
      }

      await this.createSessionRecord(tx, {
        id: nextSessionId,
        userId: user.id,
        refreshTokenHash: nextRefreshTokenHash,
        context: normalizedContext,
        expiresAt,
      });

      return true;
    });

    if (!rotated) {
      await this.revokeAllUserSessions(user.id);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    return { accessToken, refreshToken: nextRefreshToken };
  }

  private async createRefreshSession(
    userId: string,
    payload: Omit<JwtPayload, 'iat' | 'exp' | 'jti' | 'typ'>,
    context: SessionContext,
  ): Promise<string> {
    const sessionId = crypto.randomUUID();
    const refreshToken = this.signRefreshToken(payload, sessionId);

    await this.createSessionRecord(this.prisma, {
      id: sessionId,
      userId,
      refreshTokenHash: this.hashToken(refreshToken),
      context,
      expiresAt: this.getRefreshExpiry(),
    });

    return refreshToken;
  }

  private async createSessionRecord(
    client: PrismaService | Prisma.TransactionClient,
    params: {
      id: string;
      userId: string;
      refreshTokenHash: string;
      context: SessionContext;
      expiresAt: Date;
    },
  ): Promise<void> {
    await client.authSession.create({
      data: {
        id: params.id,
        userId: params.userId,
        refreshTokenHash: params.refreshTokenHash,
        deviceFingerprint: params.context.fingerprint,
        ipAddress: (params.context.ipAddress || 'unknown').slice(0, 45),
        userAgent: params.context.userAgent,
        expiresAt: params.expiresAt,
      },
    });
  }

  private buildAccessPayload(user: TokenUser, context: SessionContext): JwtPayload {
    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      kycStatus: user.kycStatus,
      ...(context.fingerprint && { fpt: context.fingerprint }),
    };
  }

  private signRefreshToken(
    payload: Omit<JwtPayload, 'iat' | 'exp' | 'jti' | 'typ'>,
    sessionId: string,
  ): string {
    return this.jwtService.sign(
      {
        ...payload,
        jti: sessionId,
        typ: 'refresh',
      },
      { expiresIn: SessionTokenService.REFRESH_TOKEN_TTL },
    );
  }

  private getRefreshExpiry(): Date {
    return new Date(Date.now() + SessionTokenService.REFRESH_TOKEN_TTL_MS);
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private timingSafeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'utf8');
    const rightBuffer = Buffer.from(right, 'utf8');

    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
  }

  private assertFingerprint(payload: JwtPayload, context: SessionContext): void {
    if (payload.fpt && payload.fpt !== context.fingerprint) {
      throw new UnauthorizedException('Token binding mismatch');
    }
  }

  private async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.authSession.update({
      where: { id: sessionId },
      data: { isRevoked: true },
    });
  }

  private async revokeAllUserSessions(userId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });
  }
}
