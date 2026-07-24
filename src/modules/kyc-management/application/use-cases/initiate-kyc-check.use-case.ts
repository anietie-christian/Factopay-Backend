// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Inject, Injectable } from '@nestjs/common';
import type { IKycRepository } from '../../domain/repositories/kyc.repository.interface';
import { KYC_REPOSITORY_TOKEN } from '../../domain/repositories/kyc.repository.interface';
import { IKycProvider, KYC_PROVIDER_TOKEN } from '../ports/kyc-provider.interface';
import { UserNotFoundException } from '../../../shared/domain/exceptions/factopay.exception';
import { KycVerificationAttempt, KycAttemptStatus } from '../../domain/models/kyc-attempt.model';
import { randomUUID } from 'crypto';

@Injectable()
export class InitiateKycCheckUseCase {
  constructor(
    @Inject(KYC_REPOSITORY_TOKEN)
    private readonly kycRepository: IKycRepository,
    @Inject(KYC_PROVIDER_TOKEN)
    private readonly kycProvider: IKycProvider,
  ) { }

  async execute(userId: string): Promise<{ sdkToken: string; externalId: string }> {
    const user = await this.kycRepository.findUserById(userId);
    if (!user) {
      throw new UserNotFoundException();
    }

    // Call Sumsub/Mock provider to generate an SDK token
    const { sdkToken, externalId } = await this.kycProvider.createVerificationSession(
      user.id,
      user.email,
    );

    // Determine provider name from implementation class name
    const providerName = this.kycProvider.constructor.name.includes('Mock') ? 'MOCK' : 'SUMSUB';

    // Log the verification attempt in db
    const attempt = new KycVerificationAttempt(
      randomUUID(),
      user.id,
      providerName,
      externalId,
      KycAttemptStatus.INITIATED,
      null,
      new Date(),
    );
    await this.kycRepository.createVerificationAttempt(attempt);

    // Transition user status to PENDING (awaiting document check)
    await this.kycRepository.updateUserKyc(user.id, 'PENDING', user.kycTier);

    return {
      sdkToken,
      externalId,
    };
  }
}
