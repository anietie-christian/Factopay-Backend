// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, NotFoundException, Inject, Logger } from '@nestjs/common';
import { GenerateOtpDto } from '../dtos/generate-otp.dto';
import { IUserRepository, USER_REPOSITORY_TOKEN } from '../../domain/repositories/user-repository.interface';
import { IOtpRepository, OTP_REPOSITORY_TOKEN } from '../../domain/repositories/otp-repository.interface';
import { OtpCode } from '../../domain/models/otp-code.model';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class GenerateOtpUseCase {
  private readonly logger = new Logger(GenerateOtpUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepository: IUserRepository,
    @Inject(OTP_REPOSITORY_TOKEN)
    private readonly otpRepository: IOtpRepository,
  ) {}

  async execute(dto: GenerateOtpDto): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepository.findById(dto.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate a cryptographically secure 6-digit code
    const rawCode = crypto.randomInt(100000, 999999).toString();

    // Hash the code
    const saltRounds = 10;
    const codeHash = await bcrypt.hash(rawCode, saltRounds);

    // Set expiry to 15 minutes from now
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    // Create the domain entity
    const otp = new OtpCode(
      crypto.randomUUID(),
      user.id,
      codeHash,
      dto.type,
      0, // attempts
      5, // maxAttempts
      false, // isUsed
      expiresAt,
      new Date(),
    );

    await this.otpRepository.save(otp);

    // In a real scenario, this is where you'd trigger the SMS/Email provider adapter.
    // We log it here for dev/testing instead of returning it to prevent exposure.
    this.logger.debug(`[DEV ONLY] Generated ${dto.type} OTP for user ${user.email}: ${rawCode}`);

    return {
      success: true,
      message: `${dto.type} OTP generated successfully`,
    };
  }
}
