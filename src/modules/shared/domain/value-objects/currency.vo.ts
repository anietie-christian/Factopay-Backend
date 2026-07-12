import { InvalidCurrencyException } from '../exceptions/value-object.exception';

export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'GHS', 'NGN', 'KES'] as const;

export type CurrencyCodeType = typeof SUPPORTED_CURRENCIES[number];
export type CurrencyCode = CurrencyCodeType;

export class Currency {
  private readonly code: CurrencyCodeType;

  constructor(code: string) {
    const upperCode = code.toUpperCase();
    if (!SUPPORTED_CURRENCIES.includes(upperCode as CurrencyCodeType)) {
      throw new InvalidCurrencyException(upperCode);
    }
    this.code = upperCode as CurrencyCodeType;
  }

  getCode(): CurrencyCodeType {
    return this.code;
  }

  equals(other: Currency): boolean {
    return this.code === other.getCode();
  }

  toString(): string {
    return this.code;
  }
}
