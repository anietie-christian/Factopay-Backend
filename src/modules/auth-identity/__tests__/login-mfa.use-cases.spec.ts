import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { VerifyMfaUseCase } from '../application/use-cases/verify-mfa.use-case';
import { IUserRepository, USER_REPOSITORY_TOKEN } from '../domain/repositories/user-repository.interface';
import { User, Role, KycStatus } from '../domain/models/user.model';
import { TotpService } from '../infrastructure/adapters/totp.service';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';

describe('Login & MFA Use Cases Integration', () => {
  let loginUseCase: LoginUseCase;
  let verifyMfaUseCase: VerifyMfaUseCase;
  let totpService: TotpService;
  let jwtService: JwtService;
  let mockUserRepository: jest.Mocked<IUserRepository>;

  const rawPassword = 'SecurePassword123!';
  let passwordHash: string;
  let userWithMfa: User;
  let userWithoutMfa: User;
  let rawTotpSecret: string;
  let encryptedTotpSecret: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'super-secret-key-for-testing-1234567890';
    passwordHash = await bcrypt.hash(rawPassword, 10);
    totpService = new TotpService();
    rawTotpSecret = authenticator.generateSecret();
    encryptedTotpSecret = totpService.encryptSecret(rawTotpSecret);
  });

  beforeEach(async () => {
    userWithMfa = new User(
      'user-mfa-123',
      'mfa-user@example.com',
      '+1234567890',
      passwordHash,
      true,
      true,
      KycStatus.APPROVED,
      'TIER_2',
      Role.USER,
      true, // isActive
      null, // lastLoginAt
      new Date(),
      new Date(),
      true, // isMfaEnabled
      encryptedTotpSecret,
      [], // mfaBackupCodes
    );

    userWithoutMfa = new User(
      'user-no-mfa-456',
      'no-mfa-user@example.com',
      '+1987654321',
      passwordHash,
      true,
      true,
      KycStatus.APPROVED,
      'TIER_1',
      Role.USER,
      true, // isActive
      null, // lastLoginAt
      new Date(),
      new Date(),
      false, // isMfaEnabled
      null,
      [],
    );

    mockUserRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByPhoneNumber: jest.fn(),
      findBySocialProvider: jest.fn(),
      linkSocialAccount: jest.fn(),
      save: jest.fn().mockImplementation((user) => Promise.resolve(user)),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginUseCase,
        VerifyMfaUseCase,
        TotpService,
        {
          provide: JwtService,
          useValue: new JwtService({ secret: 'super-secret-key-for-testing-1234567890' }),
        },
        {
          provide: USER_REPOSITORY_TOKEN,
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    loginUseCase = module.get<LoginUseCase>(LoginUseCase);
    verifyMfaUseCase = module.get<VerifyMfaUseCase>(VerifyMfaUseCase);
    jwtService = module.get<JwtService>(JwtService);
  });

  describe('Login Flow', () => {
    it('should login directly if MFA is NOT enabled', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(userWithoutMfa);

      const result = await loginUseCase.execute({
        email: 'no-mfa-user@example.com',
        password: rawPassword,
      });

      expect(result.mfaRequired).toBe(false);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.userId).toBe(userWithoutMfa.id);
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should challenge for MFA (returning mfaRequired and mfaToken) if MFA is enabled', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(userWithMfa);

      const result = await loginUseCase.execute({
        email: 'mfa-user@example.com',
        password: rawPassword,
      });

      expect(result.mfaRequired).toBe(true);
      expect(result.mfaToken).toBeDefined();
      expect(result.accessToken).toBeUndefined();
      expect(result.refreshToken).toBeUndefined();
      expect(mockUserRepository.save).not.toHaveBeenCalled(); // No login session created yet

      // Verify the structure of the token
      const decodedPayload: any = jwtService.verify(result.mfaToken!);
      expect(decodedPayload.sub).toBe(userWithMfa.id);
      expect(decodedPayload.type).toBe('MFA_VERIFICATION');
    });

    it('should throw UnauthorizedException if password is incorrect', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(userWithMfa);

      await expect(
        loginUseCase.execute({
          email: 'mfa-user@example.com',
          password: 'wrong-password',
        })
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('MFA Verification Flow', () => {
    let mfaToken: string;

    beforeEach(() => {
      mfaToken = jwtService.sign(
        { sub: userWithMfa.id, email: userWithMfa.email, type: 'MFA_VERIFICATION' },
        { expiresIn: '5m' }
      );
    });

    it('should succeed with valid TOTP code and issue session tokens', async () => {
      mockUserRepository.findById.mockResolvedValue(userWithMfa);

      const validCode = authenticator.generate(rawTotpSecret);

      const result = await verifyMfaUseCase.execute(mfaToken, validCode);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.userId).toBe(userWithMfa.id);
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should reject invalid TOTP code', async () => {
      mockUserRepository.findById.mockResolvedValue(userWithMfa);

      const invalidCode = '000000';

      await expect(
        verifyMfaUseCase.execute(mfaToken, invalidCode)
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject expired or invalid MFA token', async () => {
      const invalidToken = 'invalid.jwt.token';
      await expect(
        verifyMfaUseCase.execute(invalidToken, '123456')
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should support backup recovery codes if provided', async () => {
      const backupCode = 'backup-123-code';
      const backupCodeHash = await bcrypt.hash(backupCode, 10);
      userWithMfa.mfaBackupCodes = [backupCodeHash];

      mockUserRepository.findById.mockResolvedValue(userWithMfa);

      const result = await verifyMfaUseCase.execute(mfaToken, backupCode);

      expect(result.accessToken).toBeDefined();
      expect(result.userId).toBe(userWithMfa.id);
      expect(userWithMfa.mfaBackupCodes.length).toBe(0); // backup code should be consumed/removed
      expect(mockUserRepository.save).toHaveBeenCalled();
    });
  });
});
