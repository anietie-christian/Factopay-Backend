import { Module, FactoryProvider } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { ConfigService } from '@nestjs/config';
import { KycController } from './infrastructure/controllers/kyc.controller';
import { SubmitBasicProfileUseCase } from './application/use-cases/submit-basic-profile.use-case';
import { InitiateKycCheckUseCase } from './application/use-cases/initiate-kyc-check.use-case';
import { GetKycStatusUseCase } from './application/use-cases/get-kyc-status.use-case';
import { HandleKycWebhookUseCase } from './application/use-cases/handle-kyc-webhook.use-case';
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

@Module({
  imports: [SharedModule],
  controllers: [KycController],
  providers: [
    SubmitBasicProfileUseCase,
    InitiateKycCheckUseCase,
    GetKycStatusUseCase,
    HandleKycWebhookUseCase,
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
