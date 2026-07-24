// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { RefreshTokenDto } from '../dtos/refresh-token.dto';
import { IUserRepository, USER_REPOSITORY_TOKEN } from '../../domain/repositories/user-repository.interface';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../../infrastructure/strategy/jwt.strategy';
import { SessionContext, SessionTokenService } from '../../infrastructure/security/session-token.service';

@Injectable()
export class RefreshTokenUseCase {
  constructor(
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepository: IUserRepository,
    private readonly jwtService: JwtService,
    private readonly sessionTokenService: SessionTokenService,
  ) {}

  async execute(dto: RefreshTokenDto, sessionContext?: SessionContext | string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const normalizedContext = SessionTokenService.normalizeContext(sessionContext);
      // Decode and verify the refresh token
      const payload: JwtPayload = this.jwtService.verify(dto.refreshToken);

      if (payload.fpt && payload.fpt !== normalizedContext.fingerprint) {
        throw new UnauthorizedException('Token binding mismatch');
      }

      const user = await this.userRepository.findById(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User is inactive or no longer exists');
      }

      return await this.sessionTokenService.rotateRefreshToken(
        dto.refreshToken,
        payload,
        user,
        normalizedContext,
      );
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
