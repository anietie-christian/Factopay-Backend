import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { VerifyOtpDto } from '../dtos/verify-otp.dto';
import { IUserRepository, USER_REPOSITORY_TOKEN } from '../../domain/repositories/user-repository.interface';

@Injectable()
export class VerifyOtpUseCase {
  constructor(
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(dto: VerifyOtpDto): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepository.findById(dto.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // For the MVP sprint, we accept the mock OTP "123456"
    if (dto.code !== '123456') {
      throw new BadRequestException('Invalid OTP code');
    }

    if (dto.type === 'EMAIL') {
      if (user.isEmailVerified) {
        return { success: true, message: 'Email is already verified' };
      }
      user.verifyEmail();
    } else if (dto.type === 'SMS') {
      if (user.isPhoneVerified) {
        return { success: true, message: 'Phone number is already verified' };
      }
      user.verifyPhone();
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
