import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { IUserRepository, USER_REPOSITORY_TOKEN } from '../../domain/repositories/user-repository.interface';
import { SessionBindingService } from '../security/session-binding.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  kycStatus: string;
  fpt?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepository: IUserRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'fallbackSecretKey123!',
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: JwtPayload) {
    const ip = req.ip || req.headers['x-forwarded-for'];
    const userAgent = req.headers['user-agent'];
    const currentFingerprint = SessionBindingService.generateFingerprint(ip, userAgent);

    if (payload.fpt && payload.fpt !== currentFingerprint) {
      throw new UnauthorizedException('Token binding mismatch');
    }

    const user = await this.userRepository.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is inactive or does not exist');
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      kycStatus: user.kycStatus,
    };
  }
}
