import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './infrastructure/controllers/auth.controller';
import { UserController } from './infrastructure/controllers/user.controller';
import { RegisterUserUseCase } from './application/use-cases/register-user.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { VerifyOtpUseCase } from './application/use-cases/verify-otp.use-case';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case';
import { GetProfileUseCase } from './application/use-cases/get-profile.use-case';
import { UpdateProfileUseCase } from './application/use-cases/update-profile.use-case';
import { JwtStrategy } from './infrastructure/strategy/jwt.strategy';
import { USER_REPOSITORY_TOKEN } from './domain/repositories/user-repository.interface';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'fallbackSecretKey123!',
      signOptions: { expiresIn: '15m' },
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
    JwtStrategy,
    {
      provide: USER_REPOSITORY_TOKEN,
      useClass: PrismaUserRepository,
    },
  ],
  exports: [USER_REPOSITORY_TOKEN, JwtStrategy, PassportModule],
})
export class AuthIdentityModule {}

