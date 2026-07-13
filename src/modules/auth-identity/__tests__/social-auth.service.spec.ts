import { Test, TestingModule } from '@nestjs/testing';
import { SocialAuthService } from '../infrastructure/adapters/social-auth.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

jest.mock('google-auth-library');
jest.mock('jsonwebtoken');
jest.mock('jwks-rsa', () => {
  return jest.fn().mockImplementation(() => ({
    getSigningKey: jest.fn().mockResolvedValue({ getPublicKey: () => 'mock-public-key' }),
  }));
});

describe('SocialAuthService', () => {
  let service: SocialAuthService;
  let configService: jest.Mocked<ConfigService>;
  let mockOAuth2Client: any;

  beforeEach(async () => {
    configService = {
      get: jest.fn((key) => {
        if (key === 'GOOGLE_CLIENT_ID') return 'google-client-id';
        if (key === 'APPLE_CLIENT_ID') return 'apple-client-id';
        return null;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialAuthService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<SocialAuthService>(SocialAuthService);
    // @ts-ignore
    mockOAuth2Client = service.googleClient;
  });

  describe('Google Auth', () => {
    it('should verify a valid Google token', async () => {
      mockOAuth2Client.verifyIdToken.mockResolvedValueOnce({
        getPayload: () => ({
          sub: 'google-sub-123',
          email: 'test@google.com',
          given_name: 'John',
          family_name: 'Doe',
        }),
      });

      const profile = await service.verifyToken('GOOGLE', 'valid-token');
      expect(profile).toEqual({
        providerId: 'google-sub-123',
        email: 'test@google.com',
        firstName: 'John',
        lastName: 'Doe',
      });
    });

    it('should reject an invalid or tampered Google token', async () => {
      mockOAuth2Client.verifyIdToken.mockRejectedValueOnce(new Error('Invalid token signature'));

      await expect(service.verifyToken('GOOGLE', 'tampered-token'))
        .rejects
        .toThrow(BadRequestException);
    });
  });

  describe('Apple Auth', () => {
    it('should verify a valid Apple token', async () => {
      (jwt.decode as jest.Mock).mockReturnValueOnce({ header: { kid: 'kid-123' } });
      (jwt.verify as jest.Mock).mockReturnValueOnce({
        sub: 'apple-sub-456',
        email: 'test@apple.com',
      });

      const profile = await service.verifyToken('APPLE', 'valid-token');
      expect(profile).toEqual({
        providerId: 'apple-sub-456',
        email: 'test@apple.com',
        firstName: '',
        lastName: '',
      });
    });

    it('should reject a forged or expired Apple token', async () => {
      (jwt.decode as jest.Mock).mockReturnValueOnce({ header: { kid: 'kid-123' } });
      (jwt.verify as jest.Mock).mockImplementationOnce(() => {
        throw new Error('jwt expired');
      });

      await expect(service.verifyToken('APPLE', 'expired-token'))
        .rejects
        .toThrow(BadRequestException);
    });
  });
});
