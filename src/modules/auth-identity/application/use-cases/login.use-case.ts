import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { LoginDto } from '../dtos/login.dto';
import { IUserRepository, USER_REPOSITORY_TOKEN } from '../../domain/repositories/user-repository.interface';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepository: IUserRepository,
    private readonly jwtService: JwtService,
  ) {}

  async execute(dto: LoginDto): Promise<{ accessToken: string; refreshToken: string; userId: string; email: string; kycStatus: string }> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.getPasswordHash());
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Update login timestamp
    user.recordLogin();
    await this.userRepository.save(user);

    // Generate payload
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      kycStatus: user.kycStatus,
    };

    // Generate JWT and refresh token
    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return {
      accessToken,
      refreshToken,
      userId: user.id,
      email: user.email,
      kycStatus: user.kycStatus,
    };
  }
}
