import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { VerifyOtpDto } from '../dtos/verify-otp.dto';
import { IUserRepository, USER_REPOSITORY_TOKEN } from '../../domain/repositories/user-repository.interface';
import { IOtpRepository, OTP_REPOSITORY_TOKEN } from '../../domain/repositories/otp-repository.interface';
import * as bcrypt from 'bcrypt';

@Injectable()
export class VerifyOtpUseCase {
  constructor(
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepository: IUserRepository,
    @Inject(OTP_REPOSITORY_TOKEN)
    private readonly otpRepository: IOtpRepository,
  ) {}

  async execute(dto: VerifyOtpDto): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepository.findById(dto.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const otp = await this.otpRepository.findLatestValidOtp(user.id, dto.type);
    
    if (!otp) {
      throw new BadRequestException('No active OTP found. Please request a new one.');
    }

    if (otp.isUsed) {
      throw new BadRequestException('OTP has already been used.');
    }

    if (otp.isExpired()) {
      throw new BadRequestException('OTP has expired.');
    }

    if (otp.isMaxAttemptsReached()) {
      throw new BadRequestException('Too many failed attempts. Please request a new OTP.');
    }

    const isValid = await bcrypt.compare(dto.code, otp.codeHash);
    
    if (!isValid) {
      otp.incrementAttempts();
      await this.otpRepository.save(otp);
      throw new BadRequestException('Invalid OTP code');
    }

    // Success! Mark as used
    otp.markAsUsed();
    await this.otpRepository.save(otp);

    // Verify the user
    if (dto.type === 'EMAIL') {
      if (!user.isEmailVerified) {
        user.verifyEmail();
      }
    } else if (dto.type === 'SMS') {
      if (!user.isPhoneVerified) {
        user.verifyPhone();
      }
    } else {
      throw new BadRequestException('Invalid OTP type');
    }

    await this.userRepository.save(user);

    return {
      success: true,
      message: `${dto.type} successfully verified.`,
    };
  }
}
