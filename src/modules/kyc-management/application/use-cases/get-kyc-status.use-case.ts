import { Inject, Injectable } from '@nestjs/common';
import type { IKycRepository } from '../../domain/repositories/kyc.repository.interface';
import { KYC_REPOSITORY_TOKEN } from '../../domain/repositories/kyc.repository.interface';
import { UserNotFoundException } from '../../../shared/domain/exceptions/factopay.exception';

@Injectable()
export class GetKycStatusUseCase {
  constructor(
    @Inject(KYC_REPOSITORY_TOKEN)
    private readonly kycRepository: IKycRepository,
  ) {}

  async execute(userId: string) {
    const user = await this.kycRepository.findUserById(userId);
    if (!user) {
      throw new UserNotFoundException();
    }

    // Determine monthly transfer limits based on tier
    let monthlyLimit: number;
    switch (user.kycTier) {
      case 'TIER_1':
        monthlyLimit = 1000;
        break;
      case 'TIER_2':
        monthlyLimit = 10000;
        break;
      case 'TIER_3':
        monthlyLimit = -1; // Unlimited
        break;
      default:
        monthlyLimit = 0; // Tier 0 (NONE) or other
    }

    const documents = await this.kycRepository.findDocumentsByUserId(userId);
    const latestAttempt = await this.kycRepository.findLatestAttemptByUserId(userId);

    return {
      userId: user.id,
      kycTier: user.kycTier,
      kycStatus: user.kycStatus,
      monthlyLimit,
      documents: documents.map((doc) => ({
        id: doc.id,
        documentType: doc.documentType,
        documentUrl: doc.documentUrl,
        status: doc.status,
        rejectionReason: doc.rejectionReason,
        createdAt: doc.createdAt,
      })),
      latestAttempt: latestAttempt ? {
        id: latestAttempt.id,
        provider: latestAttempt.provider,
        status: latestAttempt.status,
        reason: latestAttempt.reason,
        createdAt: latestAttempt.createdAt,
      } : null,
    };
  }
}
