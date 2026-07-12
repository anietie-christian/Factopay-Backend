import { GetLiveRatesUseCase } from '../application/use-cases/get-live-rates.use-case';

describe('GetLiveRatesUseCase', () => {
  let useCase: GetLiveRatesUseCase;

  beforeEach(() => {
    useCase = new GetLiveRatesUseCase();
  });

  it('should return approximately 15.50 for USD to GHS', async () => {
    const result = await useCase.execute('USD', 'GHS');
    expect(result.sourceCurrency).toBe('USD');
    expect(result.targetCurrency).toBe('GHS');
    expect(result.rate).toBeGreaterThanOrEqual(15.45);
    expect(result.rate).toBeLessThanOrEqual(15.55);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it('should return approximately 16.20 for EUR to GHS', async () => {
    const result = await useCase.execute('EUR', 'GHS');
    expect(result.sourceCurrency).toBe('EUR');
    expect(result.targetCurrency).toBe('GHS');
    expect(result.rate).toBeGreaterThanOrEqual(16.15);
    expect(result.rate).toBeLessThanOrEqual(16.25);
  });

  it('should return exactly 1.0 (with slight random fluctuation) for same currency', async () => {
    const result = await useCase.execute('EUR', 'EUR');
    expect(result.sourceCurrency).toBe('EUR');
    expect(result.targetCurrency).toBe('EUR');
    expect(result.rate).toBeGreaterThanOrEqual(0.95);
    expect(result.rate).toBeLessThanOrEqual(1.05);
  });

  it('should return approximately 1.5 as fallback', async () => {
    const result = await useCase.execute('EUR', 'USD');
    expect(result.sourceCurrency).toBe('EUR');
    expect(result.targetCurrency).toBe('USD');
    expect(result.rate).toBeGreaterThanOrEqual(1.45);
    expect(result.rate).toBeLessThanOrEqual(1.55);
  });
});
