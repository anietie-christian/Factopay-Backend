import { Injectable } from '@nestjs/common';
import { CurrencyCode } from '../../../shared/domain/value-objects/currency.vo';

export interface LiveRateResponse {
  sourceCurrency: CurrencyCode;
  targetCurrency: CurrencyCode;
  rate: number;
  timestamp: Date;
  feePercentage: number;
  feeAmount?: number;
}

@Injectable()
export class GetLiveRatesUseCase {
  async execute(sourceCurrency: CurrencyCode, targetCurrency: CurrencyCode, amount?: number): Promise<LiveRateResponse> {
    // In production, this would call an external API like Fixer, OpenExchangeRates, etc.
    // For the MVP, we will mock a static or slightly randomized rate.
    
    let baseRate = 1.0;
    
    // Mock rates assuming EUR or USD to GHS (Ghana Cedis)
    if (sourceCurrency === 'USD' && targetCurrency === 'GHS') {
      baseRate = 15.50; 
    } else if (sourceCurrency === 'EUR' && targetCurrency === 'GHS') {
      baseRate = 16.20;
    } else if (sourceCurrency === targetCurrency) {
      baseRate = 1.0;
    } else {
      baseRate = 1.5; // fallback
    }

    // Add a tiny bit of random fluctuation to simulate a live market (e.g., +/- 0.05)
    const fluctuation = (Math.random() * 0.1) - 0.05;
    const finalRate = Number((baseRate + fluctuation).toFixed(4));
    
    const feePercentage = 1.5; // 1.5% fee
    const feeAmount = amount ? Number((amount * (feePercentage / 100)).toFixed(2)) : undefined;

    return {
      sourceCurrency,
      targetCurrency,
      rate: finalRate,
      timestamp: new Date(),
      feePercentage,
      feeAmount,
    };
  }
}
