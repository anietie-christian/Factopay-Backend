export class UnbalancedEntriesException extends Error {
  constructor(debits: string, credits: string) {
    super(`Double-entry violation: debits ${debits} ≠ credits ${credits}`);
    this.name = 'UnbalancedEntriesException';
  }
}
