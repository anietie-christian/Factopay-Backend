import { User } from '../../../auth-identity/domain/models/user.model';
import { KycAttemptStatus, KycVerificationAttempt } from '../models/kyc-attempt.model';
import { KycDocument } from '../models/kyc-document.model';
import { KycDocumentStatus } from '@prisma/client';

/**
 * DTO for submitting basic profile information for Tier 1 verification.
 */
export interface BasicProfile {
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  nationality: string;
  countryOfResidence: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  postalCode: string;
}

export const KYC_REPOSITORY_TOKEN = 'IKycRepository';

export interface IKycRepository {
  // User-related methods that are part of KYC context
  findUserById(userId: string): Promise<User | null>;
  saveBasicProfile(userId: string, profile: BasicProfile): Promise<User>;
  updateUserKyc(userId: string, kycStatus: string, kycTier: string): Promise<User>;

  // Document methods
  createDocument(document: KycDocument): Promise<KycDocument>;
  updateDocumentStatus(documentId: string, status: KycDocumentStatus, rejectionReason?: string): Promise<KycDocument>;
  findDocumentsByUserId(userId: string): Promise<KycDocument[]>;

  // Verification Attempt methods
  createVerificationAttempt(attempt: KycVerificationAttempt): Promise<KycVerificationAttempt>;
  updateVerificationAttempt(attemptId: string, status: KycAttemptStatus, reason?: string | null): Promise<KycVerificationAttempt>;
  findLatestAttemptByUserId(userId: string): Promise<KycVerificationAttempt | null>;
  findAttemptByExternalId(externalId: string): Promise<KycVerificationAttempt | null>;
}
