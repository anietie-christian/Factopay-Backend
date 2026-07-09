import { Inject, Injectable } from '@nestjs/common';
import type { IKycRepository } from '../../domain/repositories/kyc.repository.interface';
import { KYC_REPOSITORY_TOKEN } from '../../domain/repositories/kyc.repository.interface';
import { UserNotFoundException } from '../../../shared/domain/exceptions/factopay.exception';
import { SubmitBasicProfileDto } from '../dtos/submit-basic-profile.dto';

@Injectable()
export class SubmitBasicProfileUseCase {
  constructor(
    @Inject(KYC_REPOSITORY_TOKEN)
    private readonly kycRepository: IKycRepository,
  ) { }

  async execute(
    userId: string,
    dto: SubmitBasicProfileDto,
  ): Promise<{ userId: string; kycTier: string; kycStatus: string }> {
    const user = await this.kycRepository.findUserById(userId);
    if (!user) {
      throw new UserNotFoundException();
    }

    // Save biography profile details
    await this.kycRepository.saveBasicProfile(userId, {
      ...dto,
      dateOfBirth: new Date(dto.dateOfBirth),
    });

    // Bump user to TIER_1 and APPROVED (since TIER_1 is auto-approved upon profile completion)
    const updatedUser = await this.kycRepository.updateUserKyc(userId, 'APPROVED', 'TIER_1');

    return {
      userId,
      kycTier: updatedUser.kycTier,
      kycStatus: updatedUser.kycStatus,
    };
  }
}
