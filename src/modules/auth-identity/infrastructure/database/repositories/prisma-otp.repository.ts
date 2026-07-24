// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/database/prisma.service';
import { IOtpRepository } from '../../../domain/repositories/otp-repository.interface';
import { OtpCode } from '../../../domain/models/otp-code.model';

@Injectable()
export class PrismaOtpRepository implements IOtpRepository {
  constructor(private readonly prisma: PrismaService) {}

  private mapToDomain(record: any): OtpCode {
    return new OtpCode(
      record.id,
      record.userId,
      record.codeHash,
      record.type,
      record.attempts,
      record.maxAttempts,
      record.isUsed,
      record.expiresAt,
      record.createdAt,
    );
  }

  async save(otp: OtpCode): Promise<OtpCode> {
    const data = {
      userId: otp.userId,
      codeHash: otp.codeHash,
      type: otp.type,
      attempts: otp.attempts,
      maxAttempts: otp.maxAttempts,
      isUsed: otp.isUsed,
      expiresAt: otp.expiresAt,
    };

    const record = await this.prisma.otpCode.upsert({
      where: { id: otp.id },
      update: data,
      create: {
        id: otp.id,
        ...data,
        createdAt: otp.createdAt || new Date(),
      },
    });

    return this.mapToDomain(record);
  }

  async findLatestValidOtp(userId: string, type: string): Promise<OtpCode | null> {
    const record = await this.prisma.otpCode.findFirst({
      where: {
        userId,
        type,
      },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    });

    if (!record) {
      return null;
    }

    return this.mapToDomain(record);
  }
}
