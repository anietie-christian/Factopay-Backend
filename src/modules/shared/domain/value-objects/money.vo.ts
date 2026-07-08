import { Decimal } from 'decimal.js';

export class Money {
  private readonly amount: Decimal;
  private readonly currency: string;

  constructor(amount: number | string | Decimal, currency: string) {
    this.amount = new Decimal(amount);
    this.currency = currency.toUpperCase();
  }

  getAmount(): Decimal {
    return this.amount;
  }

  getCurrency(): string {
    return this.currency;
  }

  add(other: Money): Money {
    this.ensureSameCurrency(other);
    return new Money(this.amount.plus(other.getAmount()), this.currency);
  }

  subtract(other: Money): Money {
    this.ensureSameCurrency(other);
    return new Money(this.amount.minus(other.getAmount()), this.currency);
  }

  private ensureSameCurrency(other: Money): void {
    if (this.currency !== other.getCurrency()) {
      throw new Error(`Currency mismatch: cannot perform operation on ${this.currency} and ${other.getCurrency()}`);
    }
  }

  toJSON() {
    return {
      amount: this.amount.toString(),
      currency: this.currency,
    };
  }
}
