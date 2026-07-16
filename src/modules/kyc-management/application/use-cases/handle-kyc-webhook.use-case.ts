import { Inject, Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IKycRepository } from '../../domain/repositories/kyc.repository.interface';
import { KYC_REPOSITORY_TOKEN } from '../../domain/repositories/kyc.repository.interface';
import * as crypto from 'crypto';
import { SumsubWebhookDto } from '../dtos/sumsub-webhook.dto';
import { KycAttemptStatus } from '../../domain/models/kyc-attempt.model';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { KycStatusChangedEvent } from '../../domain/events/kyc-status-changed.event';

@Injectable()
export class HandleKycWebhookUseCase {
  constructor(
    @Inject(KYC_REPOSITORY_TOKEN)
    private readonly kycRepository: IKycRepository,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  async execute(rawBody: Buffer | string | undefined, signatureHeader: string, payload: SumsubWebhookDto): Promise<{ success: boolean }> {
    const webhookSecret = this.configService.get<string>('SUMSUB_WEBHOOK_SECRET');

    if (!webhookSecret) {
      throw new UnauthorizedException('CRITICAL SECURITY ERROR: SUMSUB_WEBHOOK_SECRET is not configured.');
    }

    if (!signatureHeader) {
      throw new UnauthorizedException('Missing Sumsub webhook signature header.');
    }

    if (!rawBody) {
      throw new UnauthorizedException('Raw request body is required for Sumsub signature verification.');
    }

    const computedHash = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    const signatureBuffer = Buffer.from(signatureHeader, 'hex');
    const computedBuffer = Buffer.from(computedHash, 'hex');

    if (
      signatureBuffer.length !== computedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, computedBuffer)
    ) {
      throw new UnauthorizedException('Invalid Sumsub webhook signature.');
    }

    if (payload.type !== 'applicantReviewed') {
      // We only care about the final review status for this use case.
      return { success: true };
    }

    // Find the attempt by the provider's external ID, which is more reliable.
    const attempt = await this.kycRepository.findAttemptByExternalId(payload.applicantId);
    if (!attempt) {
      throw new BadRequestException(`Verification attempt with external ID ${payload.applicantId} not found.`);
    }

    const user = await this.kycRepository.findUserById(attempt.userId);
    if (!user) {
      throw new BadRequestException(`User ${attempt.userId} not found.`);
    }

    const isApproved = payload.reviewResult?.reviewAnswer === 'GREEN';
    const status = isApproved ? KycAttemptStatus.APPROVED : KycAttemptStatus.REJECTED;
    const reason = payload.reviewResult?.moderationComment || payload.reviewResult?.rejectLabels?.join(', ') || null;

    // Update the attempt record
    await this.kycRepository.updateVerificationAttempt(attempt.id, status, reason);

    // Update the user's KYC status and tier based on the outcome
    if (isApproved) {
      // As per the plan, successful Sumsub check moves user to TIER_2
      await this.kycRepository.updateUserKyc(attempt.userId, 'APPROVED', 'TIER_2');

      this.eventEmitter.emit(
        KycStatusChangedEvent.eventName,
        new KycStatusChangedEvent(
          attempt.userId,
          user.kycStatus,
          'APPROVED',
          user.kycTier,
          'TIER_2',
        ),
      );
    } else {
      await this.kycRepository.updateUserKyc(attempt.userId, 'REJECTED', 'NONE');

      this.eventEmitter.emit(
        KycStatusChangedEvent.eventName,
        new KycStatusChangedEvent(
          attempt.userId,
          user.kycStatus,
          'REJECTED',
          user.kycTier,
          'NONE',
        ),
      );
    }

    return { success: true };
  }
}
