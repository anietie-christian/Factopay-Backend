import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { LoginDto } from '../dtos/login.dto';
import { IUserRepository, USER_REPOSITORY_TOKEN } from '../../domain/repositories/user-repository.interface';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { SessionContext, SessionTokenService } from '../../infrastructure/security/session-token.service';

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepository: IUserRepository,
    private readonly jwtService: JwtService,
    private readonly sessionTokenService: SessionTokenService,
  ) {}

  async execute(dto: LoginDto, sessionContext?: SessionContext | string): Promise<{ mfaRequired: boolean; mfaToken?: string; accessToken?: string; refreshToken?: string; userId?: string; email?: string; kycStatus?: string }> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const passwordHash = user.getPasswordHash();
    if (!passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check if MFA is enabled
    if (user.isMfaEnabled) {
      const mfaToken = this.jwtService.sign(
        { sub: user.id, email: user.email, type: 'MFA_VERIFICATION' },
        { expiresIn: '5m' }
      );
      return {
        mfaRequired: true,
        mfaToken,
      };
    }

    // Update login timestamp
    user.recordLogin();
    await this.userRepository.save(user);

    const { accessToken, refreshToken } = await this.sessionTokenService.issueTokens(user, sessionContext);

    return {
      mfaRequired: false,
      accessToken,
      refreshToken,
      userId: user.id,
      email: user.email,
      kycStatus: user.kycStatus,
    };
  }
}
