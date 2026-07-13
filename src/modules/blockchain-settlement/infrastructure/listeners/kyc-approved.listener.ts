import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CreateStellarAccountUseCase } from '../../application/use-cases/create-stellar-account.use-case';
import { KycStatusChangedEvent } from '../../../kyc-management/domain/events/kyc-status-changed.event';

@Injectable()
export class KycApprovedListener {
  private readonly logger = new Logger(KycApprovedListener.name);

  constructor(
    private readonly createStellarAccountUseCase: CreateStellarAccountUseCase,
  ) {}

  @OnEvent(KycStatusChangedEvent.eventName)
  async handle(event: KycStatusChangedEvent): Promise<void> {
    if (event.newStatus === 'APPROVED') {
      try {
        this.logger.log(`KYC approved event received for user ${event.userId}. Provisioning Stellar wallet.`);
        await this.createStellarAccountUseCase.execute(event.userId);
      } catch (error) {
        this.logger.error(`Failed to provision Stellar wallet for user ${event.userId} upon KYC approval:`, error);
      }
    }
  }
}
