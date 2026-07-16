import { SessionBindingService } from '../infrastructure/security/session-binding.service';
import { JwtStrategy } from '../infrastructure/strategy/jwt.strategy';
import { RefreshTokenUseCase } from '../application/use-cases/refresh-token.use-case';
import { UnauthorizedException } from '@nestjs/common';

describe('Device Fingerprinting & IP-Subnet Session Binding', () => {
  describe('SessionBindingService', () => {
    it('should correctly parse and mask IPv4 addresses to /24 subnets', () => {
      expect(SessionBindingService.getSubnet('192.168.1.45')).toBe('192.168.1.0/24');
      expect(SessionBindingService.getSubnet('10.0.5.200')).toBe('10.0.5.0/24');
    });

    it('should correctly parse and mask IPv6 addresses to /48 subnets', () => {
      expect(SessionBindingService.getSubnet('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3::/48');
      expect(SessionBindingService.getSubnet('::1')).toBe('127.0.0.0/24'); // local loopback fallback
      expect(SessionBindingService.getSubnet('::ffff:192.168.10.15')).toBe('192.168.10.0/24'); // mapped IPv4
    });

    it('should generate consistent and unique fingerprints', () => {
      const ip = '192.168.1.45';
      const ua = 'Mozilla/5.0';

      const fp1 = SessionBindingService.generateFingerprint(ip, ua);
      const fp2 = SessionBindingService.generateFingerprint('192.168.1.100', ua); // Same subnet
      const fp3 = SessionBindingService.generateFingerprint('192.168.2.45', ua);  // Different subnet
      const fp4 = SessionBindingService.generateFingerprint(ip, 'Chrome/100.0'); // Different User-Agent

      expect(fp1).toEqual(fp2); // IP within same /24 should match
      expect(fp1).not.toEqual(fp3);
      expect(fp1).not.toEqual(fp4);
    });
  });

  describe('JwtStrategy Fingerprint Validation', () => {
    let strategy: JwtStrategy;
    let mockUserRepository: any;

    beforeEach(() => {
      mockUserRepository = {
        findById: jest.fn().mockResolvedValue({ id: 'user-123', isActive: true, role: 'USER', kycStatus: 'APPROVED' }),
      };
      strategy = new JwtStrategy(mockUserRepository);
    });

    it('should pass validation when fingerprint matches', async () => {
      const ip = '192.168.1.50';
      const ua = 'Mozilla/5.0';
      const fpt = SessionBindingService.generateFingerprint(ip, ua);

      const mockReq = {
        ip,
        headers: { 'user-agent': ua },
      };

      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'USER',
        kycStatus: 'APPROVED',
        fpt,
      };

      const result = await strategy.validate(mockReq, mockPayload);
      expect(result).toBeDefined();
      expect(result.id).toBe('user-123');
    });

    it('should throw UnauthorizedException when fingerprint mismatches', async () => {
      const ip = '192.168.1.50';
      const ua = 'Mozilla/5.0';
      const fpt = SessionBindingService.generateFingerprint(ip, ua);

      const mockReq = {
        ip: '10.0.0.1', // different IP subnet
        headers: { 'user-agent': ua },
      };

      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'USER',
        kycStatus: 'APPROVED',
        fpt,
      };

      await expect(strategy.validate(mockReq, mockPayload)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('RefreshTokenUseCase Fingerprint Validation', () => {
    let useCase: RefreshTokenUseCase;
    let mockUserRepository: any;
    let mockJwtService: any;
    let mockSessionTokenService: any;

    beforeEach(() => {
      mockUserRepository = {
        findById: jest.fn().mockResolvedValue({ id: 'user-123', isActive: true, role: 'USER', kycStatus: 'APPROVED' }),
      };
      mockJwtService = {
        verify: jest.fn(),
      };
      mockSessionTokenService = {
        rotateRefreshToken: jest.fn().mockResolvedValue({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
        }),
      };
      useCase = new RefreshTokenUseCase(
        mockUserRepository,
        mockJwtService,
        mockSessionTokenService,
      );
    });

    it('should allow token refresh when fingerprint matches', async () => {
      const ip = '192.168.1.50';
      const ua = 'Mozilla/5.0';
      const fpt = SessionBindingService.generateFingerprint(ip, ua);

      mockJwtService.verify.mockReturnValue({
        sub: 'user-123',
        email: 'test@example.com',
        fpt,
      });

      const result = await useCase.execute({ refreshToken: 'valid-token' }, fpt);
      expect(result).toBeDefined();
      expect(result.accessToken).toBe('new-access-token');
      expect(mockSessionTokenService.rotateRefreshToken).toHaveBeenCalledWith(
        'valid-token',
        expect.objectContaining({
          sub: 'user-123',
          email: 'test@example.com',
          fpt,
        }),
        expect.objectContaining({
          id: 'user-123',
        }),
        { fingerprint: fpt },
      );
    });

    it('should throw UnauthorizedException when fingerprint mismatches during refresh', async () => {
      const ip = '192.168.1.50';
      const ua = 'Mozilla/5.0';
      const fpt = SessionBindingService.generateFingerprint(ip, ua);

      mockJwtService.verify.mockReturnValue({
        sub: 'user-123',
        email: 'test@example.com',
        fpt,
      });

      const differentFp = SessionBindingService.generateFingerprint('10.0.0.1', ua);

      await expect(
        useCase.execute({ refreshToken: 'valid-token' }, differentFp),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
