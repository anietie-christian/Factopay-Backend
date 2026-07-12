import { Controller, Post, Body, Request, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { RegisterDto } from '../../application/dtos/register.dto';
import { LoginDto } from '../../application/dtos/login.dto';
import { GenerateOtpDto } from '../../application/dtos/generate-otp.dto';
import { VerifyOtpDto } from '../../application/dtos/verify-otp.dto';
import { RefreshTokenDto } from '../../application/dtos/refresh-token.dto';
import { SocialVerifyDto } from '../../application/dtos/social-verify.dto';
import { CompleteSocialSignupDto } from '../../application/dtos/complete-social-signup.dto';
import { VerifyMfaDto } from '../../application/dtos/verify-mfa.dto';

import { RegisterUserUseCase } from '../../application/use-cases/register-user.use-case';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { GenerateOtpUseCase } from '../../application/use-cases/generate-otp.use-case';
import { VerifyOtpUseCase } from '../../application/use-cases/verify-otp.use-case';
import { RefreshTokenUseCase } from '../../application/use-cases/refresh-token.use-case';
import { SetupMfaUseCase } from '../../application/use-cases/setup-mfa.use-case';
import { EnableMfaUseCase } from '../../application/use-cases/enable-mfa.use-case';
import { DisableMfaUseCase } from '../../application/use-cases/disable-mfa.use-case';
import { VerifyMfaUseCase } from '../../application/use-cases/verify-mfa.use-case';
import { SocialVerifyUseCase } from '../../application/use-cases/social-verify.use-case';
import { CompleteSocialSignupUseCase } from '../../application/use-cases/complete-social-signup.use-case';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUserUseCase: RegisterUserUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly generateOtpUseCase: GenerateOtpUseCase,
    private readonly verifyOtpUseCase: VerifyOtpUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly setupMfaUseCase: SetupMfaUseCase,
    private readonly enableMfaUseCase: EnableMfaUseCase,
    private readonly disableMfaUseCase: DisableMfaUseCase,
    private readonly verifyMfaUseCase: VerifyMfaUseCase,
    private readonly socialVerifyUseCase: SocialVerifyUseCase,
    private readonly completeSocialSignupUseCase: CompleteSocialSignupUseCase,
  ) { }

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 400, description: 'Invalid input parameters' })
  @ApiResponse({ status: 409, description: 'Email or phone number already registered' })
  async register(@Body() registerDto: RegisterDto) {
    return this.registerUserUseCase.execute(registerDto);
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with credentials' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials or deactivated account' })
  async login(@Body() loginDto: LoginDto) {
    return this.loginUseCase.execute(loginDto);
  }

  @Post('otp/generate')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate an OTP code' })
  @ApiResponse({ status: 201, description: 'OTP successfully generated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async generateOtp(@Body() generateOtpDto: GenerateOtpDto) {
    return this.generateOtpUseCase.execute(generateOtpDto);
  }

  @Post('verify-otp')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email or SMS OTP code' })
  @ApiResponse({ status: 200, description: 'OTP successfully verified' })
  @ApiResponse({ status: 400, description: 'Invalid code or type' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.verifyOtpUseCase.execute(verifyOtpDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate/refresh expired access token' })
  @ApiResponse({ status: 200, description: 'Tokens successfully refreshed' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.refreshTokenUseCase.execute(refreshTokenDto);
  }

  @Post('mfa/setup')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Setup Authenticator App MFA' })
  @ApiResponse({ status: 200, description: 'Returns QR Code and raw secret' })
  @ApiResponse({ status: 401, description: 'Unauthorized access token' })
  async mfaSetup(@Request() req: any) {
    return this.setupMfaUseCase.execute(req.user.id);
  }

  @Post('mfa/enable')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify first code and enable MFA' })
  @ApiResponse({ status: 200, description: 'MFA enabled, returns 10 backup codes' })
  @ApiResponse({ status: 400, description: 'Invalid code' })
  async mfaEnable(@Request() req: any, @Body() body: VerifyMfaDto) {
    return this.enableMfaUseCase.execute(req.user.id, body.code);
  }

  @Post('mfa/disable')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable Authenticator App MFA' })
  @ApiResponse({ status: 200, description: 'MFA disabled successfully' })
  @ApiResponse({ status: 400, description: 'Invalid code or secret' })
  async mfaDisable(@Request() req: any, @Body() body: VerifyMfaDto) {
    return this.disableMfaUseCase.execute(req.user.id, body.code);
  }

  @Post('mfa/verify')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify MFA code during login' })
  @ApiResponse({ status: 200, description: 'MFA verified, returns access/refresh token session' })
  @ApiResponse({ status: 401, description: 'Invalid code or token' })
  async mfaVerify(@Body() body: VerifyMfaDto) {
    if (!body.mfaToken) {
      throw new Error('MFA token is required for public verification');
    }
    return this.verifyMfaUseCase.execute(body.mfaToken, body.code);
  }

  @Post('social/verify')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify Social OAuth Token (Google/Apple)' })
  @ApiResponse({ status: 200, description: 'Returns token session, MFA challenge, or pending signup state' })
  @ApiResponse({ status: 400, description: 'Invalid provider token' })
  async socialVerify(@Body() body: SocialVerifyDto) {
    return this.socialVerifyUseCase.execute(body.provider, body.token);
  }

  @Post('social/complete-signup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete Social Sign up by associating a phone number' })
  @ApiResponse({ status: 200, description: 'Returns final JWT session tokens' })
  @ApiResponse({ status: 409, description: 'Phone number already registered' })
  async socialCompleteSignup(@Body() body: CompleteSocialSignupDto) {
    return this.completeSocialSignupUseCase.execute(body.registrationToken, body.phoneNumber);
  }
}
