import { Decimal } from 'decimal.js';
import { Currency } from './currency.vo';
import { InvalidMoneyException } from '../exceptions/value-object.exception';

export class Money {
  private readonly amount: Decimal;
  private readonly currency: Currency;

  constructor(amount: number | string | Decimal, currencyCode: string | Currency) {
    try {
      // 1. Initialize Decimal and enforce exactly 4 decimal places of precision
      const rawAmount = new Decimal(amount);
      
      // 2. Prevent negative amounts natively
      if (rawAmount.isNegative()) {
        throw new InvalidMoneyException('Money amount cannot be negative');
      }

      this.amount = rawAmount.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

      // 3. Validate and assign the currency
      this.currency = currencyCode instanceof Currency ? currencyCode : new Currency(currencyCode);
    } catch (error) {
      if (error instanceof InvalidMoneyException) {
        throw error;
      }
      throw new InvalidMoneyException(`Invalid money initialization: ${(error as Error).message}`);
    }
  }

  getAmount(): Decimal {
    return this.amount;
  }

  getCurrency(): Currency {
    return this.currency;
  }

  getCurrencyCode(): string {
    return this.currency.getCode();
  }

  add(other: Money): Money {
    this.ensureSameCurrency(other);
    return new Money(this.amount.plus(other.getAmount()), this.currency);
  }

  subtract(other: Money): Money {
    this.ensureSameCurrency(other);
    const newAmount = this.amount.minus(other.getAmount());
    if (newAmount.isNegative()) {
      throw new InvalidMoneyException('Subtraction results in a negative money amount');
    }
    return new Money(newAmount, this.currency);
  }

  private ensureSameCurrency(other: Money): void {
    if (!this.currency.equals(other.getCurrency())) {
      throw new InvalidMoneyException(`Currency mismatch: cannot perform operation on ${this.currency.getCode()} and ${other.getCurrencyCode()}`);
    }
  }

  toJSON() {
    return {
      amount: this.amount.toString(),
      currency: this.currency.getCode(),
    };
  }
}
