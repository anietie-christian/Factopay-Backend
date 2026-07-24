// ---------------------------------------------------------------------------------------------------------------#*eddiere
export enum KycAttemptStatus {
  INITIATED = 'INITIATED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class KycVerificationAttempt {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly provider: string, // e.g., 'SUMSUB', 'MOCK'
    public readonly externalId: string | null,
    public status: KycAttemptStatus,
    public reason: string | null, // Rejection reason
    public readonly createdAt: Date,
  ) { }

  approve(): void {
    this.status = KycAttemptStatus.APPROVED;
    this.reason = null;
  }

  reject(reason: string): void {
    this.status = KycAttemptStatus.REJECTED;
    this.reason = reason;
  }
}
