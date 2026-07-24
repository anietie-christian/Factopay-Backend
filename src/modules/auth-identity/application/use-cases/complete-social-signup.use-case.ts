// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, Inject, NotFoundException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY_TOKEN } from '../../domain/repositories/user-repository.interface';
import { JwtService } from '@nestjs/jwt';
import { SessionContext, SessionTokenService } from '../../infrastructure/security/session-token.service';

@Injectable()
export class CompleteSocialSignupUseCase {
  constructor(
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepository: IUserRepository,
    private readonly jwtService: JwtService,
    private readonly sessionTokenService: SessionTokenService,
  ) {}

  async execute(registrationToken: string, phoneNumber: string, sessionContext?: SessionContext | string): Promise<{ accessToken: string; refreshToken: string; userId: string; email: string; kycStatus: string }> {
    let payload: any;
    try {
      payload = this.jwtService.verify(registrationToken);
    } catch (e) {
      throw new UnauthorizedException('Invalid or expired registration token');
    }

    if (payload.type !== 'SOCIAL_REGISTRATION') {
      throw new UnauthorizedException('Invalid token type');
    }

    const userId = payload.sub;
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if phone number is already registered by another account
    const existingPhone = await this.userRepository.findByPhoneNumber(phoneNumber);
    if (existingPhone && existingPhone.id !== user.id) {
      throw new ConflictException('Phone number already registered by another account');
    }

    // Update user properties
    (user as any).phoneNumber = phoneNumber;
    user.isPhoneVerified = true; // Mark as verified since the signup step is completed
    await this.userRepository.save(user);

    const { accessToken, refreshToken } = await this.sessionTokenService.issueTokens(user, sessionContext);

    return {
      accessToken,
      refreshToken,
      userId: user.id,
      email: user.email,
      kycStatus: user.kycStatus,
    };
  }
}
