// ---------------------------------------------------------------------------------------------------------------#*eddiere
export class OtpCode {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly codeHash: string,
    public readonly type: string,
    public attempts: number,
    public maxAttempts: number,
    public isUsed: boolean,
    public readonly expiresAt: Date,
    public readonly createdAt: Date,
  ) {}

  public isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  public isMaxAttemptsReached(): boolean {
    return this.attempts >= this.maxAttempts;
  }

  public incrementAttempts(): void {
    this.attempts++;
  }

  public markAsUsed(): void {
    this.isUsed = true;
  }
}
