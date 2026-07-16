import { Module, FactoryProvider } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { ConfigService } from '@nestjs/config';
import { KycController } from './infrastructure/controllers/kyc.controller';
import { AdminKycController } from './infrastructure/controllers/admin-kyc.controller';
import { SubmitBasicProfileUseCase } from './application/use-cases/submit-basic-profile.use-case';
import { InitiateKycCheckUseCase } from './application/use-cases/initiate-kyc-check.use-case';
import { GetKycStatusUseCase } from './application/use-cases/get-kyc-status.use-case';
import { HandleKycWebhookUseCase } from './application/use-cases/handle-kyc-webhook.use-case';
import { AdminGetKycQueueUseCase } from './application/use-cases/admin-get-kyc-queue.use-case';
import { AdminGetKycDetailsUseCase } from './application/use-cases/admin-get-kyc-details.use-case';
import { AdminApproveKycUseCase } from './application/use-cases/admin-approve-kyc.use-case';
import { AdminRejectKycUseCase } from './application/use-cases/admin-reject-kyc.use-case';
import { AdminRequestResubmissionUseCase } from './application/use-cases/admin-request-resubmission.use-case';
import { AdminUpgradeKycTierUseCase } from './application/use-cases/admin-upgrade-kyc-tier.use-case';
import { IKycRepository, KYC_REPOSITORY_TOKEN } from './domain/repositories/kyc.repository.interface';
import { PrismaKycRepository } from './infrastructure/persistence/prisma-kyc.repository';
import { IKycProvider, KYC_PROVIDER_TOKEN } from './application/ports/kyc-provider.interface';
import { SumsubProviderAdapter } from './infrastructure/adapters/sumsub-provider.adapter';
import { SumsubMockAdapter } from './infrastructure/adapters/sumsub-mock.adapter';

const kycProviderFactory: FactoryProvider<IKycProvider> = {
  provide: KYC_PROVIDER_TOKEN,
  useFactory: (configService: ConfigService) => {
    const sumsubToken = configService.get<string>('SUMSUB_APP_TOKEN');
    // In a real production environment, you might have a more robust check
    return sumsubToken ? new SumsubProviderAdapter(configService) : new SumsubMockAdapter();
  },
  inject: [ConfigService],
};

import { GatewayIntegrationsModule } from '../gateway-integrations/gateway-integrations.module';

@Module({
  imports: [SharedModule, GatewayIntegrationsModule],
  controllers: [KycController, AdminKycController],
  providers: [
    // User-facing use cases
    SubmitBasicProfileUseCase,
    InitiateKycCheckUseCase,
    GetKycStatusUseCase,
    HandleKycWebhookUseCase,
    // Admin use cases
    AdminGetKycQueueUseCase,
    AdminGetKycDetailsUseCase,
    AdminApproveKycUseCase,
    AdminRejectKycUseCase,
    AdminRequestResubmissionUseCase,
    AdminUpgradeKycTierUseCase,
    // Infrastructure
    {
      provide: KYC_REPOSITORY_TOKEN,
      useClass: PrismaKycRepository,
    },
    kycProviderFactory,
  ],
  exports: [
    SubmitBasicProfileUseCase,
    InitiateKycCheckUseCase,
    GetKycStatusUseCase,
    HandleKycWebhookUseCase,
  ],
})
export class KycManagementModule { }
