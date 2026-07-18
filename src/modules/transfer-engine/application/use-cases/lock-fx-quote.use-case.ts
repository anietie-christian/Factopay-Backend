import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from '../../../shared/infrastructure/cache/redis.service';
import { GetLiveRatesUseCase } from './get-live-rates.use-case';
import { CurrencyCode } from '../../../shared/domain/value-objects/currency.vo';

export interface FxQuoteResponse {
  quoteId: string;
  sourceCurrency: CurrencyCode;
  targetCurrency: CurrencyCode;
  rate: number;
  feePercentage: number;
  expiresInSeconds: number;
  expiresAt: Date;
}

@Injectable()
export class LockFxQuoteUseCase {
  constructor(
    private readonly getLiveRatesUseCase: GetLiveRatesUseCase,
    private readonly redisService: RedisService,
  ) {}

  async execute(sourceCurrency: CurrencyCode, targetCurrency: CurrencyCode): Promise<FxQuoteResponse> {
    // 1. Fetch current live rate
    const liveRate = await this.getLiveRatesUseCase.execute(sourceCurrency, targetCurrency);
    
    // 2. Generate unique quote ID
    const quoteId = randomUUID();
    
    // 3. Define lock duration (30 seconds)
    const ttlSeconds = 30;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    
    const quoteData = {
      sourceCurrency,
      targetCurrency,
      rate: liveRate.rate,
      feePercentage: liveRate.feePercentage,
      expiresAt: expiresAt.toISOString(),
    };

    // 4. Save to Redis
    const redisKey = `fx_quote:${quoteId}`;
    await this.redisService.setWithExpiry(redisKey, JSON.stringify(quoteData), ttlSeconds);

    // 5. Return locked quote to caller
    return {
      quoteId,
      sourceCurrency,
      targetCurrency,
      rate: liveRate.rate,
      feePercentage: liveRate.feePercentage,
      expiresInSeconds: ttlSeconds,
      expiresAt,
    };
  }
}
