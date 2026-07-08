import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY_TOKEN } from '../../domain/repositories/user-repository.interface';
import { TotpService } from '../../infrastructure/adapters/totp.service';

@Injectable()
export class SetupMfaUseCase {
  constructor(
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepository: IUserRepository,
    private readonly totpService: TotpService,
  ) {}

  async execute(userId: string): Promise<{ secret: string; qrCode: string }> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isMfaEnabled) {
      throw new BadRequestException('MFA is already enabled on this account');
    }

    // Generate new secret
    const { secret, qrCode } = await this.totpService.generateSecret(user.email);

    // Encrypt the secret
    const encryptedSecret = this.totpService.encryptSecret(secret);

    // Save encrypted secret to user profile (temporarily until verified and enabled)
    user.mfaSecret = encryptedSecret;
    await this.userRepository.save(user);

    return {
      secret, // Send plain text secret so user can manually type it in
      qrCode,
    };
  }
}
