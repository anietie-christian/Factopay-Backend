import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { IUserRepository, USER_REPOSITORY_TOKEN } from '../../domain/repositories/user-repository.interface';
import { UserStatus } from '../../domain/models/user.model';
import * as crypto from 'crypto';

@Injectable()
export class CompleteAccountClosureUseCase {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepository: IUserRepository,
  ) {}

  /**
   * Finalizes the account closure by anonymizing user profile and critical authentication info,
   * setting status to CLOSED, but leaving transaction/ledger logs intact for compliance auditing.
   */
  async execute(userId: string) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.status !== UserStatus.CLOSURE_REQUESTED) {
      throw new BadRequestException('User is not in closure requested status');
    }

    const request = await this.prisma.accountClosureRequest.findUnique({
      where: { userId },
    });

    if (!request || request.status !== 'PENDING') {
      throw new BadRequestException('No pending closure request record found');
    }

    const now = new Date();

    // 1. Anonymize user details
    const anonymizedEmail = `deleted-${crypto.randomUUID()}@anonymized.factopay.internal`;
    user.status = UserStatus.CLOSED;
    user.isActive = false;
    user.updatePasswordHash(`CLOSED_${crypto.randomBytes(32).toString('hex')}`);
    
    // Explicitly modify email in DB transaction/upsert
    // Let's do a direct database updates for PII data to avoid unique constraints conflicts
    await this.prisma.$transaction(async (tx) => {
      // update closure request
      await tx.accountClosureRequest.update({
        where: { userId },
        data: {
          status: 'COMPLETED',
          completedAt: now,
        },
      });

      // update user profile to remove PII
      await tx.userProfile.updateMany({
        where: { userId },
        data: {
          firstName: 'Anonymized',
          lastName: 'User',
          dateOfBirth: null,
          addressLine1: null,
          addressLine2: null,
          city: null,
          postalCode: null,
          avatarUrl: null,
        },
      });

      // update user record directly
      await tx.user.update({
        where: { id: userId },
        data: {
          email: anonymizedEmail,
          phoneNumber: null,
          phoneNumberIndex: null,
          passwordHash: user.getPasswordHash(),
          isActive: false,
          status: 'CLOSED',
          isMfaEnabled: false,
          mfaSecret: null,
          mfaBackupCodes: [],
        },
      });
    });

    return {
      message: 'Account closure completed. User PII has been anonymized.',
    };
  }
}
