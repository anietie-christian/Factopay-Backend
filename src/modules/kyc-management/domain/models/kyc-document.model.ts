import { KycDocumentType, KycDocumentStatus } from '@prisma/client';

export { KycDocumentType, KycDocumentStatus };

export class KycDocument {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly documentType: KycDocumentType,
    public readonly documentUrl: string,
    public status: KycDocumentStatus,
    public rejectionReason: string | null,
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) { }

  approve(): void {
    if (this.status === KycDocumentStatus.APPROVED) {
      return;
    }
    this.status = KycDocumentStatus.APPROVED;
    this.rejectionReason = null;
    this.updatedAt = new Date();
  }

  reject(reason: string): void {
    this.status = KycDocumentStatus.REJECTED;
    this.rejectionReason = reason;
    this.updatedAt = new Date();
  }
}
