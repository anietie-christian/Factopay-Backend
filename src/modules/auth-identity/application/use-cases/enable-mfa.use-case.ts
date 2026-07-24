// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY_TOKEN } from '../../domain/repositories/user-repository.interface';
import { TotpService } from '../../infrastructure/adapters/totp.service';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class EnableMfaUseCase {
  constructor(
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepository: IUserRepository,
    private readonly totpService: TotpService,
  ) {}

  async execute(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isMfaEnabled) {
      throw new BadRequestException('MFA is already enabled');
    }

    if (!user.mfaSecret) {
      throw new BadRequestException('MFA setup has not been initiated');
    }

    // Decrypt secret
    const decryptedSecret = this.totpService.decryptSecret(user.mfaSecret);

    // Verify code
    const isValid = this.totpService.verifyCode(code, decryptedSecret);
    if (!isValid) {
      throw new BadRequestException('Invalid verification code');
    }

    // Generate 10 backup codes
    const plainBackupCodes: string[] = [];
    const hashedBackupCodes: string[] = [];

    for (let i = 0; i < 10; i++) {
      const plainCode = crypto.randomBytes(5).toString('hex'); // 10 characters e.g. "a3b4c5d6e7"
      plainBackupCodes.push(plainCode);

      const hashedCode = await bcrypt.hash(plainCode, 10);
      hashedBackupCodes.push(hashedCode);
    }

    // Enable MFA
    user.isMfaEnabled = true;
    user.mfaBackupCodes = hashedBackupCodes;
    await this.userRepository.save(user);

    return {
      backupCodes: plainBackupCodes,
    };
  }
}
