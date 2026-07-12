export class InsufficientBalanceException extends Error {
  constructor(available: string, required: string, currency: string) {
    super(`Insufficient balance: have ${available} ${currency}, need ${required} ${currency}`);
    this.name = 'InsufficientBalanceException';
  }
}
