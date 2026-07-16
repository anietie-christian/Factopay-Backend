import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { IUserRepository, USER_REPOSITORY_TOKEN } from '../../domain/repositories/user-repository.interface';
import { UserStatus } from '../../domain/models/user.model';

@Injectable()
export class CancelAccountClosureUseCase {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(userId: string) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.status !== UserStatus.CLOSURE_REQUESTED) {
      throw new BadRequestException('No pending account closure request found');
    }

    const request = await this.prisma.accountClosureRequest.findUnique({
      where: { userId },
    });

    if (!request || request.status !== 'PENDING') {
      throw new BadRequestException('No pending closure request record found');
    }

    if (request.coolingOffEnds <= new Date()) {
      throw new BadRequestException('Cooling-off period has already ended. Request cannot be cancelled.');
    }

    // Restore user state
    user.status = UserStatus.ACTIVE;
    user.isActive = true;
    await this.userRepository.save(user);

    // Cancel request
    await this.prisma.accountClosureRequest.update({
      where: { userId },
      data: {
        status: 'CANCELLED',
      },
    });

    return {
      message: 'Account closure request cancelled successfully. Account has been restored to active status.',
    };
  }
}
