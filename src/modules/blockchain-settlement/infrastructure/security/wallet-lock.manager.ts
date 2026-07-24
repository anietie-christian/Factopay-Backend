// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, Logger } from '@nestjs/common';
import { Mutex } from 'async-mutex';
import { RedisService } from '../../../shared/infrastructure/cache/redis.service';
import { StellarWalletRole } from '../../domain/gateways/stellar-gateway.interface';

export interface IWalletLockManager {
  acquire(role: StellarWalletRole, ttlMs?: number): Promise<() => Promise<void>>;
}

@Injectable()
export class WalletLockManager implements IWalletLockManager {
  private readonly logger = new Logger(WalletLockManager.name);
  private readonly localLocks = new Map<StellarWalletRole, Mutex>();

  constructor(private readonly redisService: RedisService) {
    Object.values(StellarWalletRole).forEach((role) => {
      this.localLocks.set(role, new Mutex());
    });
  }

  /**
   * Acquires a lock for a specific Stellar wallet role.
   * Uses a hybrid lock model: local async-mutex followed by Redis distributed locking.
   * If Redis is unavailable or fails, it falls back gracefully to local-only coordination.
   */
  async acquire(role: StellarWalletRole, ttlMs = 15000): Promise<() => Promise<void>> {
    const localLock = this.localLocks.get(role);
    if (!localLock) {
      throw new Error(`No local lock initialized for role ${role}`);
    }

    // 1. Acquire local lock (forces coordination within the same process)
    const releaseLocal = await localLock.acquire();

    // 2. Try to acquire the Redis distributed lock
    const lockKey = `lock:wallet:${role.toLowerCase()}`;
    const lockValue = Math.random().toString(36).substring(2);
    let acquiredDistributed = false;

    try {
      const ttlSec = Math.max(Math.ceil(ttlMs / 1000), 1);
      let attempts = 0;
      const maxAttempts = 15;
      const delayMs = 100;

      while (attempts < maxAttempts) {
        const success = await this.redisService.setNxWithExpiry(lockKey, lockValue, ttlSec);
        if (success) {
          acquiredDistributed = true;
          break;
        }
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      if (!acquiredDistributed) {
        this.logger.warn(`Failed to acquire distributed lock for role ${role} after ${maxAttempts} attempts. Proceeding with local lock only.`);
      }
    } catch (error) {
      this.logger.error(`Error acquiring distributed lock for role ${role}. Falling back to local lock only.`, error);
    }

    // 3. Return the composite release function
    return async () => {
      try {
        if (acquiredDistributed) {
          // Verify ownership before deleting
          const currentValue = await this.redisService.get(lockKey);
          if (currentValue === lockValue) {
            await this.redisService.delete(lockKey);
          }
        }
      } catch (error) {
        this.logger.error(`Error releasing distributed lock for role ${role}`, error);
      } finally {
        releaseLocal();
      }
    };
  }
}
