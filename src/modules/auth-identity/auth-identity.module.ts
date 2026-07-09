import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './infrastructure/controllers/auth.controller';
import { ConfigService } from '@nestjs/config';
import { UserController } from './infrastructure/controllers/user.controller';
import { RegisterUserUseCase } from './application/use-cases/register-user.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { VerifyOtpUseCase } from './application/use-cases/verify-otp.use-case';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case';
import { GetProfileUseCase } from './application/use-cases/get-profile.use-case';
import { UpdateProfileUseCase } from './application/use-cases/update-profile.use-case';
import { SetupMfaUseCase } from './application/use-cases/setup-mfa.use-case';
import { EnableMfaUseCase } from './application/use-cases/enable-mfa.use-case';
import { DisableMfaUseCase } from './application/use-cases/disable-mfa.use-case';
import { VerifyMfaUseCase } from './application/use-cases/verify-mfa.use-case';
import { SocialVerifyUseCase } from './application/use-cases/social-verify.use-case';
import { CompleteSocialSignupUseCase } from './application/use-cases/complete-social-signup.use-case';
import { TotpService } from './infrastructure/adapters/totp.service';
import { SocialAuthService } from './infrastructure/adapters/social-auth.service';
import { JwtStrategy } from './infrastructure/strategy/jwt.strategy';
import { USER_REPOSITORY_TOKEN } from './domain/repositories/user-repository.interface';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, UserController],
  providers: [
    RegisterUserUseCase,
    LoginUseCase,
    VerifyOtpUseCase,
    RefreshTokenUseCase,
    GetProfileUseCase,
    UpdateProfileUseCase,
    SetupMfaUseCase,
    EnableMfaUseCase,
    DisableMfaUseCase,
    VerifyMfaUseCase,
    SocialVerifyUseCase,
    CompleteSocialSignupUseCase,
    TotpService,
    SocialAuthService,
    JwtStrategy,
    {
      provide: USER_REPOSITORY_TOKEN,
      useClass: PrismaUserRepository,
    },
  ],
  exports: [USER_REPOSITORY_TOKEN, JwtStrategy, PassportModule],
})
export class AuthIdentityModule { }
