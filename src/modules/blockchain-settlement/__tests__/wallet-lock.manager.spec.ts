import { Test, TestingModule } from '@nestjs/testing';
import { WalletLockManager } from '../infrastructure/security/wallet-lock.manager';
import { RedisService } from '../../shared/infrastructure/cache/redis.service';
import { StellarWalletRole } from '../domain/gateways/stellar-gateway.interface';

describe('WalletLockManager', () => {
  let lockManager: WalletLockManager;
  let mockRedisService: any;

  beforeEach(async () => {
    mockRedisService = {
      setNxWithExpiry: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletLockManager,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    lockManager = module.get<WalletLockManager>(WalletLockManager);
  });

  it('should acquire and release lock successfully using local mutex and Redis Nx key', async () => {
    mockRedisService.setNxWithExpiry.mockResolvedValue(true);
    mockRedisService.get.mockResolvedValue('some-value'); // Mock owner value
    
    // Override value helper to track lock owner
    let currentLockValue = '';
    mockRedisService.setNxWithExpiry.mockImplementation((key, val) => {
      currentLockValue = val;
      return Promise.resolve(true);
    });
    mockRedisService.get.mockImplementation(() => Promise.resolve(currentLockValue));

    const release = await lockManager.acquire(StellarWalletRole.MASTER);
    expect(mockRedisService.setNxWithExpiry).toHaveBeenCalledWith(
      'lock:wallet:master',
      expect.any(String),
      expect.any(Number),
    );

    await release();
    expect(mockRedisService.delete).toHaveBeenCalledWith('lock:wallet:master');
  });

  it('should fall back to local-only lock if Redis throws an error', async () => {
    mockRedisService.setNxWithExpiry.mockRejectedValue(new Error('Redis connection down'));

    const release = await lockManager.acquire(StellarWalletRole.FEE);
    expect(mockRedisService.setNxWithExpiry).toHaveBeenCalled();

    // Verify releasing works without throwing
    await expect(release()).resolves.not.toThrow();
  });

  it('should fail to release Redis lock if ownership value has changed (expired lock)', async () => {
    mockRedisService.setNxWithExpiry.mockResolvedValue(true);
    mockRedisService.get.mockResolvedValue('a-different-owner-value'); // Simulated TTL expiration and re-acquire by other pod

    const release = await lockManager.acquire(StellarWalletRole.LIQUIDITY);
    await release();

    // Delete should not be called since ownership checked failed
    expect(mockRedisService.delete).not.toHaveBeenCalled();
  });
});
