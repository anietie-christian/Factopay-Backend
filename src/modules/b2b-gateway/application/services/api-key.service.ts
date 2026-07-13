import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a new API key for a user, returning the raw key.
   * Only the hash is stored in the database.
   */
  async generateApiKey(userId: string): Promise<string> {
    const rawKey = `fp_live_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = this.hashKey(rawKey);

    await this.prisma.gatewayApiKey.create({
      data: {
        userId,
        keyHash,
        isActive: true,
      },
    });

    return rawKey;
  }

  /**
   * Validates a raw API key against the stored hashes.
   * Returns the API key record if valid, otherwise throws UnauthorizedException.
   */
  async validateApiKey(rawKey: string) {
    const keyHash = this.hashKey(rawKey);

    const apiKeyRecord = await this.prisma.gatewayApiKey.findUnique({
      where: { keyHash },
    });

    if (!apiKeyRecord) {
      throw new UnauthorizedException('Invalid API Key');
    }

    if (!apiKeyRecord.isActive) {
      throw new UnauthorizedException('API Key has been revoked');
    }

    if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('API Key has expired');
    }

    return apiKeyRecord;
  }

  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }
}
