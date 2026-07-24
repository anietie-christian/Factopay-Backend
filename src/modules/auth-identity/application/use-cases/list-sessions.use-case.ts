// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';

export interface SessionSummary {
  id: string;
  ipAddress: string;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
}

@Injectable()
export class ListSessionsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Return all non-revoked, non-expired sessions for the authenticated user.
   * Sensitive fields (refreshTokenHash, deviceFingerprint) are never exposed.
   */
  async execute(userId: string): Promise<SessionSummary[]> {
    const sessions = await this.prisma.authSession.findMany({
      where: {
        userId,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions;
  }
}
