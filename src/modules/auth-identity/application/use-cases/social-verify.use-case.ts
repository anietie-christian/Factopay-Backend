import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY_TOKEN } from '../../domain/repositories/user-repository.interface';
import { randomUUID } from 'crypto';
import { SocialAuthService } from '../../infrastructure/adapters/social-auth.service';
import { User, Role, KycStatus } from '../../domain/models/user.model';
import { JwtService } from '@nestjs/jwt';

export interface SocialVerifyResult {
  mfaRequired: boolean;
  mfaToken?: string;
  registrationRequired: boolean;
  registrationToken?: string;
  accessToken?: string;
  refreshToken?: string;
  userId?: string;
  email?: string;
  kycStatus?: string;
}

@Injectable()
export class SocialVerifyUseCase {
  constructor(
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepository: IUserRepository,
    private readonly socialAuthService: SocialAuthService,
    private readonly jwtService: JwtService,
  ) { }

  async execute(provider: 'GOOGLE' | 'APPLE', token: string): Promise<SocialVerifyResult> {
    // 1. Verify token with provider
    const socialProfile = await this.socialAuthService.verifyToken(provider, token);

    // 2. Try to find user by social account provider/providerId
    let user = await this.userRepository.findBySocialProvider(provider, socialProfile.providerId);

    if (user) {
      return this.handleExistingUserLogin(user);
    }

    // 3. If no social account mapping exists, check if user exists by email
    const userByEmail = await this.userRepository.findByEmail(socialProfile.email);
    if (userByEmail) {
      // Link social account to existing user
      await this.userRepository.linkSocialAccount(userByEmail.id, provider, socialProfile.providerId);
      return this.handleExistingUserLogin(userByEmail);
    }

    // 4. Create new user account with no password/phone (PENDING signup stage)
    const newUserId = randomUUID();
    const newUser = new User(
      newUserId,
      socialProfile.email,
      null, // No phone number yet
      null, // Passwordless
      true,  // Email is already verified by Google/Apple
      false, // Phone is NOT verified
      KycStatus.UNVERIFIED,
      'NONE',
      Role.USER,
      true, // isActive
      null, // lastLoginAt
      new Date(),
      new Date(),
    );

    const savedUser = await this.userRepository.save(newUser);

    // Link social account
    await this.userRepository.linkSocialAccount(savedUser.id, provider, socialProfile.providerId);

    // Generate short-lived registration token to complete Step 2
    const registrationToken = this.jwtService.sign(
      { sub: savedUser.id, email: savedUser.email, type: 'SOCIAL_REGISTRATION' },
      { expiresIn: '15m' }
    );

    return {
      mfaRequired: false,
      registrationRequired: true,
      registrationToken,
    };
  }

  private async handleExistingUserLogin(user: User): Promise<SocialVerifyResult> {
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // If user exists but has no phone number, they must complete registration
    if (!user.phoneNumber) {
      const registrationToken = this.jwtService.sign(
        { sub: user.id, email: user.email, type: 'SOCIAL_REGISTRATION' },
        { expiresIn: '15m' }
      );
      return {
        mfaRequired: false,
        registrationRequired: true,
        registrationToken,
      };
    }

    // Check if MFA is enabled
    if (user.isMfaEnabled) {
      const mfaToken = this.jwtService.sign(
        { sub: user.id, email: user.email, type: 'MFA_VERIFICATION' },
        { expiresIn: '5m' }
      );
      return {
        mfaRequired: true,
        mfaToken,
        registrationRequired: false,
      };
    }

    // Update login timestamp
    user.recordLogin();
    await this.userRepository.save(user);

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      kycStatus: user.kycStatus,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return {
      mfaRequired: false,
      registrationRequired: false,
      accessToken,
      refreshToken,
      userId: user.id,
      email: user.email,
      kycStatus: user.kycStatus,
    };
  }
}
