// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, Inject, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY_TOKEN } from '../../domain/repositories/user-repository.interface';
import { TotpService } from '../../infrastructure/adapters/totp.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { SessionContext, SessionTokenService } from '../../infrastructure/security/session-token.service';

@Injectable()
export class VerifyMfaUseCase {
  constructor(
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepository: IUserRepository,
    private readonly totpService: TotpService,
    private readonly jwtService: JwtService,
    private readonly sessionTokenService: SessionTokenService,
  ) {}

  async execute(mfaToken: string, code: string, sessionContext?: SessionContext | string): Promise<{ accessToken: string; refreshToken: string; userId: string; email: string; kycStatus: string }> {
    let payload: any;
    try {
      payload = this.jwtService.verify(mfaToken);
    } catch (e) {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }

    if (payload.type !== 'MFA_VERIFICATION') {
      throw new UnauthorizedException('Invalid token type');
    }

    const userId = payload.sub;
    const user = await this.userRepository.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or account deactivated');
    }

    if (!user.isMfaEnabled) {
      throw new BadRequestException('MFA is not enabled on this account');
    }

    // Try verifying as a standard TOTP code first
    let isValid = false;
    if (user.mfaSecret) {
      const decryptedSecret = this.totpService.decryptSecret(user.mfaSecret);
      isValid = this.totpService.verifyCode(code, decryptedSecret);
    }

    // If not a valid TOTP code, check if it matches any backup recovery codes
    if (!isValid && user.mfaBackupCodes.length > 0) {
      const remainingBackupCodes = [...user.mfaBackupCodes];
      for (let i = 0; i < remainingBackupCodes.length; i++) {
        const matches = await bcrypt.compare(code, remainingBackupCodes[i]);
        if (matches) {
          isValid = true;
          // Remove used backup code from the list
          remainingBackupCodes.splice(i, 1);
          user.mfaBackupCodes = remainingBackupCodes;
          break;
        }
      }
    }

    if (!isValid) {
      throw new UnauthorizedException('Invalid verification code');
    }

    // Update login timestamp
    user.recordLogin();
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
