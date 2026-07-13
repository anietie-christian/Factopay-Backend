import { Injectable } from '@nestjs/common';
import { IUserRepository } from '../../domain/repositories/user-repository.interface';
import { User, Role, KycStatus } from '../../domain/models/user.model';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { PiiCrypt } from '../security/pii-crypt';

@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDomain(dbUser: any): User {
    return new User(
      dbUser.id,
      dbUser.email,
      PiiCrypt.decrypt(dbUser.phoneNumber),
      dbUser.passwordHash,
      dbUser.isEmailVerified,
      dbUser.isPhoneVerified,
      dbUser.kycStatus as KycStatus,
      dbUser.kycTier,
      dbUser.role as Role,
      dbUser.isActive,
      dbUser.lastLoginAt,
      dbUser.createdAt,
      dbUser.updatedAt,
      dbUser.isMfaEnabled,
      dbUser.mfaSecret,
      dbUser.mfaBackupCodes,
    );
  }

  private toPersistence(user: User): any {
    return {
      id: user.id,
      email: user.email,
      phoneNumber: PiiCrypt.encrypt(user.phoneNumber),
      phoneNumberIndex: PiiCrypt.generateBlindIndex(user.phoneNumber),
      passwordHash: user.getPasswordHash(),
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      kycStatus: user.kycStatus,
      kycTier: user.kycTier,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      isMfaEnabled: user.isMfaEnabled,
      mfaSecret: user.mfaSecret,
      mfaBackupCodes: user.mfaBackupCodes,
    };
  }

  async findById(id: string): Promise<User | null> {
    const dbUser = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!dbUser) return null;
    return this.toDomain(dbUser);
  }

  async findByEmail(email: string): Promise<User | null> {
    const dbUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!dbUser) return null;
    return this.toDomain(dbUser);
  }

  async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    const index = PiiCrypt.generateBlindIndex(phoneNumber);
    if (!index) return null;
    const dbUser = await this.prisma.user.findUnique({
      where: { phoneNumberIndex: index },
    });
    if (!dbUser) return null;
    return this.toDomain(dbUser);
  }

  async findBySocialProvider(provider: string, providerId: string): Promise<User | null> {
    const dbUser = await this.prisma.user.findFirst({
      where: {
        socialAccounts: {
          some: {
            provider,
            providerId,
          },
        },
      },
    });
    if (!dbUser) return null;
    return this.toDomain(dbUser);
  }

  async linkSocialAccount(userId: string, provider: string, providerId: string): Promise<void> {
    await this.prisma.socialAccount.create({
      data: {
        userId,
        provider,
        providerId,
      },
    });
  }

  async save(user: User): Promise<User> {
    const data = this.toPersistence(user);
    const dbUser = await this.prisma.user.upsert({
      where: { id: user.id },
      update: {
        email: data.email,
        phoneNumber: data.phoneNumber,
        phoneNumberIndex: data.phoneNumberIndex,
        passwordHash: data.passwordHash,
        isEmailVerified: data.isEmailVerified,
        isPhoneVerified: data.isPhoneVerified,
        kycStatus: data.kycStatus,
        kycTier: data.kycTier,
        role: data.role,
        isActive: data.isActive,
        lastLoginAt: data.lastLoginAt,
        updatedAt: data.updatedAt,
        isMfaEnabled: data.isMfaEnabled,
        mfaSecret: data.mfaSecret,
        mfaBackupCodes: data.mfaBackupCodes,
      },
      create: data,
    });
    return this.toDomain(dbUser);
  }
}
