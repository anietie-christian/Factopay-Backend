import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './infrastructure/controllers/auth.controller';
import { RegisterUserUseCase } from './application/use-cases/register-user.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { VerifyOtpUseCase } from './application/use-cases/verify-otp.use-case';
import { JwtStrategy } from './infrastructure/strategy/jwt.strategy';
import { USER_REPOSITORY_TOKEN } from './domain/repositories/user-repository.interface';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { PrismaService } from '../shared/infrastructure/database/prisma.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'fallbackSecretKey123!',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    RegisterUserUseCase,
    LoginUseCase,
    VerifyOtpUseCase,
    JwtStrategy,
    PrismaService, // Used by PrismaUserRepository
    {
      provide: USER_REPOSITORY_TOKEN,
      useClass: PrismaUserRepository,
    },
  ],
  exports: [USER_REPOSITORY_TOKEN, JwtStrategy, PassportModule],
})
export class AuthIdentityModule {}
