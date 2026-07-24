// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';

@Injectable()
export class LogoutAllUseCase {
  private readonly logger = new Logger(LogoutAllUseCase.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Revoke all active sessions for a given user.
   * After this call every refresh token the user holds becomes invalid.
   */
  async execute(userId: string): Promise<{ message: string; revokedCount: number }> {
    const result = await this.prisma.authSession.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });

    this.logger.log(`User ${userId} logged out of all devices — ${result.count} sessions revoked`);
    return { message: 'All sessions revoked', revokedCount: result.count };
  }
}
