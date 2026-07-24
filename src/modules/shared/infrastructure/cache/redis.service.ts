// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private redisClient: Redis;
  private readonly logger = new Logger(RedisService.name);

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' && !process.env.REDIS_HOST) {
      return;
    }

    if (process.env.REDIS_URL) {
      this.redisClient = new Redis(process.env.REDIS_URL);
    } else {
      this.redisClient = new Redis({
        host: process.env.REDIS_HOST || 'redis',
        port: Number(process.env.REDIS_PORT) || 6379,
      });
    }

    this.redisClient.on('connect', () => {
      this.logger.log('Successfully connected to Redis');
    });

    this.redisClient.on('error', (err) => {
      this.logger.error('Redis connection error', err);
    });
  }

  onModuleDestroy() {
    if (this.redisClient) {
      this.redisClient.disconnect();
    }
  }

  async setWithExpiry(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.assertClient();
    await this.redisClient.set(key, value, 'EX', ttlSeconds);
  }

  async setNxWithExpiry(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    this.assertClient();
    const result = await this.redisClient.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async get(key: string): Promise<string | null> {
    this.assertClient();
    return this.redisClient.get(key);
  }

  async delete(key: string): Promise<void> {
    this.assertClient();
    await this.redisClient.del(key);
  }

  async ping(): Promise<string> {
    this.assertClient();
    return this.redisClient.ping();
  }

  private assertClient(): void {
    if (!this.redisClient) {
      throw new Error('Redis client is not initialized. Set REDIS_HOST or provide a RedisService mock.');
    }
  }
}
