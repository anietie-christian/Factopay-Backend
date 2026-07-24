// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';

@Injectable()
export class AdminGetUserDetailsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phoneNumber: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        kycStatus: true,
        kycTier: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
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
        socialAccounts: {
          select: {
            provider: true,
            providerId: true,
          },
        },
        sessions: {
          select: {
            id: true,
            ipAddress: true,
            isRevoked: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
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
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      kycStatus: user.kycStatus,
      kycTier: user.kycTier,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      profile: user.profile,
      socialAccounts: user.socialAccounts,
      recentSessions: user.sessions,
    };
  }
}
