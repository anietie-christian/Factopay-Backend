import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { RefreshTokenDto } from '../dtos/refresh-token.dto';
import { IUserRepository, USER_REPOSITORY_TOKEN } from '../../domain/repositories/user-repository.interface';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../../infrastructure/strategy/jwt.strategy';

@Injectable()
export class RefreshTokenUseCase {
  constructor(
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepository: IUserRepository,
    private readonly jwtService: JwtService,
  ) {}

  async execute(dto: RefreshTokenDto): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      // Decode and verify the refresh token
      const payload: JwtPayload = this.jwtService.verify(dto.refreshToken);

      const user = await this.userRepository.findById(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User is inactive or no longer exists');
      }

      // Generate new payload
      const newPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        kycStatus: user.kycStatus,
      };

      // Generate fresh tokens
      const accessToken = this.jwtService.sign(newPayload, { expiresIn: '15m' });
      const refreshToken = this.jwtService.sign(newPayload, { expiresIn: '7d' });

      return {
        accessToken,
        refreshToken,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
