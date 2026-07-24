// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';

@Injectable()
export class AdminGetKycDetailsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phoneNumber: true,
        kycStatus: true,
        kycTier: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            dateOfBirth: true,
            nationality: true,
            countryOfResidence: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            postalCode: true,
          },
        },
        kycDocuments: {
          select: {
            id: true,
            documentType: true,
            documentUrl: true,
            status: true,
            rejectionReason: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        kycAttempts: {
          select: {
            id: true,
            provider: true,
            externalId: true,
            status: true,
            reason: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found.`);
    }

    return {
      userId: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      kycStatus: user.kycStatus,
      kycTier: user.kycTier,
      isActive: user.isActive,
      registeredAt: user.createdAt,
      profile: user.profile,
      documents: user.kycDocuments,
      verificationHistory: user.kycAttempts,
    };
  }
}
