// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY_TOKEN } from '../../domain/repositories/user-repository.interface';
import { TotpService } from '../../infrastructure/adapters/totp.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class DisableMfaUseCase {
  constructor(
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepository: IUserRepository,
    private readonly totpService: TotpService,
  ) {}

  async execute(userId: string, code: string): Promise<{ success: boolean }> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isMfaEnabled) {
      throw new BadRequestException('MFA is not enabled');
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
      throw new BadRequestException('Invalid TOTP or backup recovery code');
    }

    // Wiping the security config fields to disable MFA
    user.isMfaEnabled = false;
    user.mfaSecret = null;
    user.mfaBackupCodes = [];
    await this.userRepository.save(user);

    return { success: true };
  }
}
