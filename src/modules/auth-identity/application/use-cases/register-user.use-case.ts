// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, ConflictException, Inject } from '@nestjs/common';
import { RegisterDto } from '../dtos/register.dto';
import { User, Role, KycStatus } from '../../domain/models/user.model';
import { IUserRepository, USER_REPOSITORY_TOKEN } from '../../domain/repositories/user-repository.interface';
import * as bcrypt from 'bcrypt';

@Injectable()
export class RegisterUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(dto: RegisterDto): Promise<{ userId: string; message: string }> {
    const existingEmail = await this.userRepository.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException('Email already registered');
    }

    const existingPhone = await this.userRepository.findByPhoneNumber(dto.phoneNumber);
    if (existingPhone) {
      throw new ConflictException('Phone number already registered');
    }

    // Hash password with bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    // Create User entity
    const newUser = new User(
      crypto.randomUUID(),
      dto.email,
      dto.phoneNumber,
      passwordHash,
      false, // isEmailVerified
      false, // isPhoneVerified
      KycStatus.UNVERIFIED,
      'NONE', // kycTier
      Role.USER,
      true, // isActive
      null, // lastLoginAt
      new Date(),
      new Date(),
    );

    const savedUser = await this.userRepository.save(newUser);

    // Trigger OTP sending here in production (simulated for MVP)
    // In actual implementation, this will publish an event or call an OTP service.

    return {
      userId: savedUser.id,
      message: 'Registration successful. Please verify your phone number and email.',
    };
  }
}
