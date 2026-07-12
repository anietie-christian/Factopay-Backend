import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ProvisionWalletUseCase } from '../../application/use-cases/provision-wallet.use-case';
import { KycStatusChangedEvent } from '../../../kyc-management/domain/events/kyc-status-changed.event';

import { ConfigService } from '@nestjs/config';

@Injectable()
export class KycApprovedListener {
  constructor(
    private readonly provisionWalletUseCase: ProvisionWalletUseCase,
    private readonly configService: ConfigService,
  ) {}

  @OnEvent(KycStatusChangedEvent.eventName)
  async handle(event: KycStatusChangedEvent): Promise<void> {
    if (event.newStatus === 'APPROVED') {
      const defaultCurrencies = this.configService.get<string>('DEFAULT_WALLET_CURRENCIES', 'EUR,USD,GBP');
      const currencies = defaultCurrencies.split(',').map(c => c.trim());
      
      for (const currency of currencies) {
        await this.provisionWalletUseCase.execute(event.userId, currency);
      }
    }
  }
}
