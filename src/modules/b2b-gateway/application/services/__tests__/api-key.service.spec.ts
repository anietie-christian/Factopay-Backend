import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeyService } from '../api-key.service';
import { PrismaService } from '../../../../shared/infrastructure/database/prisma.service';
import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('ApiKeyService', () => {
  let service: ApiKeyService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        {
          provide: PrismaService,
          useValue: {
            gatewayApiKey: {
              create: jest.fn(),
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ApiKeyService>(ApiKeyService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should throw UnauthorizedException if API key is not found', async () => {
    (prisma.gatewayApiKey.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.validateApiKey('fp_live_invalid')).rejects.toThrow(
      new UnauthorizedException('Invalid API Key')
    );
  });

  it('should throw UnauthorizedException if API key is revoked (isActive: false)', async () => {
    const rawKey = 'fp_live_revoked';
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    (prisma.gatewayApiKey.findUnique as jest.Mock).mockResolvedValue({
      id: 'key-123',
      userId: 'user-123',
      keyHash,
      isActive: false, // Revoked!
      rateLimitTier: 10,
    });

    await expect(service.validateApiKey(rawKey)).rejects.toThrow(
      new UnauthorizedException('API Key has been revoked')
    );
  });

  it('should throw UnauthorizedException if API key has expired', async () => {
    const rawKey = 'fp_live_expired';
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    
    const pastDate = new Date();
    pastDate.setFullYear(pastDate.getFullYear() - 1); // 1 year ago

    (prisma.gatewayApiKey.findUnique as jest.Mock).mockResolvedValue({
      id: 'key-123',
      userId: 'user-123',
      keyHash,
      isActive: true,
      expiresAt: pastDate, // Expired!
      rateLimitTier: 10,
    });

    await expect(service.validateApiKey(rawKey)).rejects.toThrow(
      new UnauthorizedException('API Key has expired')
    );
  });

  it('should return the API key record if valid, active, and not expired', async () => {
    const rawKey = 'fp_live_valid';
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    
    const validRecord = {
      id: 'key-123',
      userId: 'user-123',
      keyHash,
      isActive: true,
      expiresAt: null, // Never expires
      rateLimitTier: 10,
    };

    (prisma.gatewayApiKey.findUnique as jest.Mock).mockResolvedValue(validRecord);

    const result = await service.validateApiKey(rawKey);
    expect(result).toEqual(validRecord);
  });
});
