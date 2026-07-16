import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';

@Injectable()
export class LogoutUseCase {
  private readonly logger = new Logger(LogoutUseCase.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Revoke a single session identified by the refresh token's jti claim.
   * This is intentionally lenient: we decode without full verification so
   * that logout works even if the refresh token has expired.
   */
  async execute(userId: string, refreshToken: string): Promise<{ message: string }> {
    let jti: string | undefined;

    try {
      const decoded = this.jwtService.decode(refreshToken) as Record<string, unknown> | null;
      jti = decoded?.jti as string | undefined;
    } catch {
      // If the token is completely malformed, treat as already logged out
      this.logger.warn(`Logout called with un-decodable refresh token for user ${userId}`);
      return { message: 'Logged out' };
    }

    if (!jti) {
      return { message: 'Logged out' };
    }

    // Revoke only if the session belongs to this user (prevents cross-user revocation)
    await this.prisma.authSession.updateMany({
      where: { id: jti, userId, isRevoked: false },
      data: { isRevoked: true },
    });

    this.logger.log(`User ${userId} logged out session ${jti}`);
    return { message: 'Logged out' };
  }
}
