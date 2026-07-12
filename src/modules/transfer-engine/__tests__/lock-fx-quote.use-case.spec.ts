import { LockFxQuoteUseCase } from '../application/use-cases/lock-fx-quote.use-case';
import { GetLiveRatesUseCase } from '../application/use-cases/get-live-rates.use-case';
import { RedisService } from '../../shared/infrastructure/cache/redis.service';

describe('LockFxQuoteUseCase', () => {
  let useCase: LockFxQuoteUseCase;
  let getLiveRatesUseCase: jest.Mocked<GetLiveRatesUseCase>;
  let redisService: jest.Mocked<RedisService>;

  beforeEach(() => {
    getLiveRatesUseCase = {
      execute: jest.fn(),
    } as any;
    
    redisService = {
      setWithExpiry: jest.fn(),
    } as any;

    useCase = new LockFxQuoteUseCase(getLiveRatesUseCase, redisService);
  });

  it('should lock fx quote and return correct response', async () => {
    getLiveRatesUseCase.execute.mockResolvedValue({
      sourceCurrency: 'EUR',
      targetCurrency: 'GHS',
      rate: 16.20,
      timestamp: new Date(),
    });

    const result = await useCase.execute('EUR', 'GHS');

    expect(result.sourceCurrency).toBe('EUR');
    expect(result.targetCurrency).toBe('GHS');
    expect(result.rate).toBe(16.20);
    expect(result.expiresInSeconds).toBe(30);
    expect(result.quoteId).toBeDefined();
    expect(result.expiresAt).toBeInstanceOf(Date);

    expect(redisService.setWithExpiry).toHaveBeenCalledTimes(1);
    expect(redisService.setWithExpiry).toHaveBeenCalledWith(
      `fx_quote:${result.quoteId}`,
      expect.any(String),
      30
    );
  });
});
