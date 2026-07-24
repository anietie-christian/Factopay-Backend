// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { IKycRepository, BasicProfile } from '../../domain/repositories/kyc.repository.interface';
import { User, Role, KycStatus as UserKycStatus } from '../../../auth-identity/domain/models/user.model';
import { KycDocument, KycDocumentStatus } from '../../domain/models/kyc-document.model';
import { KycVerificationAttempt, KycAttemptStatus } from '../../domain/models/kyc-attempt.model';
import { PiiCrypt } from '../../../auth-identity/infrastructure/security/pii-crypt';
import {
  KycDocument as PrismaKycDocument,
  KycVerificationAttempt as PrismaKycAttempt,
  User as PrismaUser,
  UserProfile as PrismaUserProfile,
  SocialAccount as PrismaSocialAccount,
  KycDocumentType,
} from '@prisma/client';

type FullPrismaUser = PrismaUser & {
  profile: PrismaUserProfile | null;
  socialAccounts: PrismaSocialAccount[];
};

@Injectable()
export class PrismaKycRepository implements IKycRepository {
  constructor(private readonly prisma: PrismaService) { }

  async findUserById(userId: string): Promise<User | null> {
    const prismaUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, socialAccounts: true },
    });
    return prismaUser ? this.toUserDomain(prismaUser as FullPrismaUser) : null;
  }

  async saveBasicProfile(userId: string, profile: BasicProfile): Promise<User> {
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        profile: {
          upsert: {
            create: { ...profile },
            update: { ...profile },
          },
        },
      },
      include: { profile: true, socialAccounts: true },
    });
    return this.toUserDomain(updatedUser as FullPrismaUser);
  }

  async updateUserKyc(userId: string, kycStatus: string, kycTier: string): Promise<User> {
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { kycStatus, kycTier },
      include: { profile: true, socialAccounts: true },
    });
    return this.toUserDomain(updatedUser as FullPrismaUser);
  }

  async createDocument(document: KycDocument): Promise<KycDocument> {
    const newDoc = await this.prisma.kycDocument.create({
      data: {
        id: document.id,
        userId: document.userId,
        documentType: document.documentType,
        documentUrl: PiiCrypt.encrypt(document.documentUrl) || '',
        status: document.status,
      },
    });
    return this.toKycDocumentDomain(newDoc);
  }

  async updateDocumentStatus(documentId: string, status: KycDocumentStatus, reason?: string): Promise<KycDocument> {
    const updatedDoc = await this.prisma.kycDocument.update({
      where: { id: documentId },
      data: { status, rejectionReason: reason },
    });
    return this.toKycDocumentDomain(updatedDoc);
  }

  async findDocumentsByUserId(userId: string): Promise<KycDocument[]> {
    const documents = await this.prisma.kycDocument.findMany({
      where: { userId },
    });
    return documents.map(this.toKycDocumentDomain);
  }

  async createVerificationAttempt(attempt: KycVerificationAttempt): Promise<KycVerificationAttempt> {
    const newAttempt = await this.prisma.kycVerificationAttempt.create({
      data: {
        id: attempt.id,
        userId: attempt.userId,
        provider: attempt.provider,
        externalId: attempt.externalId,
        status: attempt.status,
        reason: attempt.reason,
      },
    });
    return this.toKycAttemptDomain(newAttempt);
  }

  async updateVerificationAttempt(attemptId: string, status: KycAttemptStatus, reason?: string | null): Promise<KycVerificationAttempt> {
    const updatedAttempt = await this.prisma.kycVerificationAttempt.update({
      where: { id: attemptId },
      data: { status, reason },
    });
    return this.toKycAttemptDomain(updatedAttempt);
  }

  async findLatestAttemptByUserId(userId: string): Promise<KycVerificationAttempt | null> {
    const attempt = await this.prisma.kycVerificationAttempt.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return attempt ? this.toKycAttemptDomain(attempt) : null;
  }

  async findAttemptByExternalId(externalId: string): Promise<KycVerificationAttempt | null> {
    const attempt = await this.prisma.kycVerificationAttempt.findFirst({
      where: { externalId },
    });
    return attempt ? this.toKycAttemptDomain(attempt) : null;
  }

  // --- Mappers ---

  private toUserDomain(prismaUser: FullPrismaUser): User {
    const user = new User(
      prismaUser.id,
      prismaUser.email,
      PiiCrypt.decrypt(prismaUser.phoneNumber),
      prismaUser.passwordHash,
      prismaUser.isEmailVerified,
      prismaUser.isPhoneVerified,
      prismaUser.kycStatus as UserKycStatus,
      prismaUser.kycTier,
      prismaUser.role as Role,
      prismaUser.isActive,
      prismaUser.lastLoginAt,
      prismaUser.createdAt,
      prismaUser.updatedAt,
    );

    // Hydrate optional properties
    user.isMfaEnabled = prismaUser.isMfaEnabled;
    user.mfaSecret = prismaUser.mfaSecret;
    user.mfaBackupCodes = prismaUser.mfaBackupCodes;

    if (prismaUser.profile) {
      user.profile = {
        firstName: prismaUser.profile.firstName,
        lastName: prismaUser.profile.lastName,
        dateOfBirth: prismaUser.profile.dateOfBirth,
        nationality: prismaUser.profile.nationality,
        countryOfResidence: prismaUser.profile.countryOfResidence,
        addressLine1: prismaUser.profile.addressLine1,
        addressLine2: prismaUser.profile.addressLine2,
        city: prismaUser.profile.city,
        postalCode: prismaUser.profile.postalCode,
      };
    }

    if (prismaUser.socialAccounts) {
      user.socialAccounts = prismaUser.socialAccounts.map(sa => ({
        provider: sa.provider,
        providerId: sa.providerId,
      }));
    }

    return user;
  }

  private toKycDocumentDomain(prismaDoc: PrismaKycDocument): KycDocument {
    return new KycDocument(
      prismaDoc.id,
      prismaDoc.userId,
      prismaDoc.documentType as KycDocumentType,
      PiiCrypt.decrypt(prismaDoc.documentUrl) || '',
      prismaDoc.status as KycDocumentStatus,
      prismaDoc.rejectionReason,
      prismaDoc.createdAt,
      prismaDoc.updatedAt,
    );
  }

  private toKycAttemptDomain(prismaAttempt: PrismaKycAttempt): KycVerificationAttempt {
    return new KycVerificationAttempt(
      prismaAttempt.id,
      prismaAttempt.userId,
      prismaAttempt.provider,
      prismaAttempt.externalId,
      prismaAttempt.status as KycAttemptStatus,
      prismaAttempt.reason,
      prismaAttempt.createdAt,
    );
  }
}
