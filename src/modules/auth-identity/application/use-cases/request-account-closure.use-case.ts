import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { IUserRepository, USER_REPOSITORY_TOKEN } from '../../domain/repositories/user-repository.interface';
import { UserStatus } from '../../domain/models/user.model';
import { LogoutAllUseCase } from './logout-all.use-case';

@Injectable()
export class RequestAccountClosureUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logoutAll: LogoutAllUseCase,
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(userId: string, reason?: string) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.status === UserStatus.CLOSURE_REQUESTED) {
      throw new BadRequestException('Account closure has already been requested');
    }

    if (user.status === UserStatus.CLOSED) {
      throw new BadRequestException('Account is already closed');
    }

    const now = new Date();
    const coolingOffEnds = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Update user state in database
    user.status = UserStatus.CLOSURE_REQUESTED;
    user.isActive = false;
    user.isMfaEnabled = false;
    user.mfaSecret = null;
    user.mfaBackupCodes = [];

    await this.userRepository.save(user);

    // Create or update closure request record
    await this.prisma.accountClosureRequest.upsert({
      where: { userId },
      update: {
        reason,
        status: 'PENDING',
        requestedAt: now,
        coolingOffEnds,
        completedAt: null,
      },
      create: {
        userId,
        reason,
        status: 'PENDING',
        requestedAt: now,
        coolingOffEnds,
      },
    });

    // Revoke all active sessions
    await this.logoutAll.execute(userId);

    return {
      message: 'Account closure requested. A 30-day cooling-off period has begun.',
      coolingOffEnds,
    };
  }
}
