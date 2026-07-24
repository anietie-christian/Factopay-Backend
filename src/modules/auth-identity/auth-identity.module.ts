// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './infrastructure/controllers/auth.controller';
import { ConfigService } from '@nestjs/config';
import { UserController } from './infrastructure/controllers/user.controller';
import { AdminUsersController } from './infrastructure/controllers/admin-users.controller';
import { AdminDashboardController } from './infrastructure/controllers/admin-dashboard.controller';

import { RegisterUserUseCase } from './application/use-cases/register-user.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { GenerateOtpUseCase } from './application/use-cases/generate-otp.use-case';
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
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { LogoutAllUseCase } from './application/use-cases/logout-all.use-case';
import { ListSessionsUseCase } from './application/use-cases/list-sessions.use-case';
import { RequestAccountClosureUseCase } from './application/use-cases/request-account-closure.use-case';
import { CancelAccountClosureUseCase } from './application/use-cases/cancel-account-closure.use-case';
import { CompleteAccountClosureUseCase } from './application/use-cases/complete-account-closure.use-case';

// Admin Use Cases
import { AdminListUsersUseCase } from './application/use-cases/admin-list-users.use-case';
import { AdminGetUserDetailsUseCase } from './application/use-cases/admin-get-user-details.use-case';
import { AdminSuspendUserUseCase } from './application/use-cases/admin-suspend-user.use-case';
import { AdminUnsuspendUserUseCase } from './application/use-cases/admin-unsuspend-user.use-case';
import { AdminUpdateRoleUseCase } from './application/use-cases/admin-update-role.use-case';
import { AdminDashboardOverviewUseCase } from './application/use-cases/admin-dashboard-overview.use-case';
import { AdminGetAuditLogUseCase } from './application/use-cases/admin-get-audit-log.use-case';

import { TotpService } from './infrastructure/adapters/totp.service';
import { SocialAuthService } from './infrastructure/adapters/social-auth.service';
import { JwtStrategy } from './infrastructure/strategy/jwt.strategy';
import { SessionTokenService } from './infrastructure/security/session-token.service';
import { USER_REPOSITORY_TOKEN } from './domain/repositories/user-repository.interface';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { OTP_REPOSITORY_TOKEN } from './domain/repositories/otp-repository.interface';
import { PrismaOtpRepository } from './infrastructure/database/repositories/prisma-otp.repository';
import { getRequiredEnv } from '../../config/required-env';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || getRequiredEnv('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, UserController, AdminUsersController, AdminDashboardController],
  providers: [
    // User endpoints Use Cases
    RegisterUserUseCase,
    LoginUseCase,
    GenerateOtpUseCase,
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
    LogoutUseCase,
    LogoutAllUseCase,
    ListSessionsUseCase,
    RequestAccountClosureUseCase,
    CancelAccountClosureUseCase,
    CompleteAccountClosureUseCase,
    // Admin endpoints Use Cases
    AdminListUsersUseCase,
    AdminGetUserDetailsUseCase,
    AdminSuspendUserUseCase,
    AdminUnsuspendUserUseCase,
    AdminUpdateRoleUseCase,
    AdminDashboardOverviewUseCase,
    AdminGetAuditLogUseCase,
    // Adapters/Infrastructure
    TotpService,
    SocialAuthService,
    SessionTokenService,
    JwtStrategy,
    {
      provide: USER_REPOSITORY_TOKEN,
      useClass: PrismaUserRepository,
    },
    {
      provide: OTP_REPOSITORY_TOKEN,
      useClass: PrismaOtpRepository,
    },
  ],
  exports: [USER_REPOSITORY_TOKEN, JwtStrategy, PassportModule],
})
export class AuthIdentityModule { }
