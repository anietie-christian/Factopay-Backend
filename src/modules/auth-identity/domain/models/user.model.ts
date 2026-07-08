export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum KycStatus {
  UNVERIFIED = 'UNVERIFIED',
  PENDING = 'PENDING',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class User {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly phoneNumber: string,
    private passwordHash: string,
    public isEmailVerified: boolean,
    public isPhoneVerified: boolean,
    public kycStatus: KycStatus,
    public kycTier: string,
    public role: Role,
    public isActive: boolean,
    public lastLoginAt: Date | null,
    public createdAt: Date,
    public updatedAt: Date,
  ) {}

  getPasswordHash(): string {
    return this.passwordHash;
  }

  updatePasswordHash(newHash: string): void {
    this.passwordHash = newHash;
    this.updatedAt = new Date();
  }

  verifyEmail(): void {
    this.isEmailVerified = true;
    this.updatedAt = new Date();
  }

  verifyPhone(): void {
    this.isPhoneVerified = true;
    this.updatedAt = new Date();
  }

  updateKycStatus(status: KycStatus, tier: string): void {
    this.kycStatus = status;
    this.kycTier = tier;
    this.updatedAt = new Date();
  }

  recordLogin(): void {
    this.lastLoginAt = new Date();
    this.updatedAt = new Date();
  }

  deactivate(): void {
    this.isActive = false;
    this.updatedAt = new Date();
  }
}
