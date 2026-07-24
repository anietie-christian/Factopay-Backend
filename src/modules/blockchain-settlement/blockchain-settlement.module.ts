// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SharedModule } from '../shared/shared.module';
import { BlockchainController } from './infrastructure/controllers/blockchain.controller';

// Use Cases
import { SubmitSettlementUseCase } from './application/use-cases/submit-settlement.use-case';
import { VerifySettlementUseCase } from './application/use-cases/verify-settlement.use-case';
import { MintTestUsdcUseCase } from './application/use-cases/mint-test-usdc.use-case';
import { GetBlockchainTransactionUseCase } from './application/use-cases/get-blockchain-transaction.use-case';
import { CreateStellarAccountUseCase } from './application/use-cases/create-stellar-account.use-case';
import { ListBlockchainTransactionsUseCase } from './application/use-cases/list-blockchain-transactions.use-case';
import { ListStellarWalletsUseCase } from './application/use-cases/list-stellar-wallets.use-case';

// Domain
import { STELLAR_GATEWAY_TOKEN } from './domain/gateways/stellar-gateway.interface';
import { BLOCKCHAIN_REPOSITORY_TOKEN } from './domain/repositories/blockchain-repository.interface';
import { MemoResolver, AnchorConfig } from './domain/models/memo-resolver';

// Infrastructure & Adapters
import { StellarService } from './infrastructure/adapters/stellar.service';
import { PrismaBlockchainRepository } from './infrastructure/persistence/prisma-blockchain.repository';
import { DestinationAllowlistService } from './infrastructure/security/destination-allowlist.service';
import { SettlementLimitsService } from './infrastructure/security/settlement-limits.service';
import { WalletLockManager } from './infrastructure/security/wallet-lock.manager';
import { KycApprovedListener } from './infrastructure/listeners/kyc-approved.listener';

@Module({
  imports: [SharedModule],
  controllers: [BlockchainController],
  providers: [
    // Use Cases
    SubmitSettlementUseCase,
    VerifySettlementUseCase,
    MintTestUsdcUseCase,
    GetBlockchainTransactionUseCase,
    CreateStellarAccountUseCase,
    ListBlockchainTransactionsUseCase,
    ListStellarWalletsUseCase,

    // Security Checks & Locks
    DestinationAllowlistService,
    SettlementLimitsService,
    WalletLockManager,

    // Listeners
    KycApprovedListener,

    // Domain Services
    {
      provide: MemoResolver,
      useFactory: (configService: ConfigService) => {
        const anchors: AnchorConfig[] = [
          {
            name: 'Flutterwave Stellar',
            publicKey: configService.get<string>('STELLAR_ANCHOR_FLUTTERWAVE_PUBLIC', ''),
            memoPrefix: 'FW',
            country: 'NG',
          },
          {
            name: 'Kotani Pay',
            publicKey: configService.get<string>('STELLAR_ANCHOR_KOTANIPAY_PUBLIC', ''),
            memoPrefix: 'KP',
            country: 'GH',
          },
          {
            name: 'VALR',
            publicKey: configService.get<string>('STELLAR_ANCHOR_VALR_PUBLIC', ''),
            memoPrefix: 'VALR',
            country: 'ZA',
          },
        ];
        return new MemoResolver(anchors);
      },
      inject: [ConfigService],
    },

    // Repositories & Gateways
    PrismaBlockchainRepository,
    {
      provide: BLOCKCHAIN_REPOSITORY_TOKEN,
      useExisting: PrismaBlockchainRepository,
    },
    {
      provide: STELLAR_GATEWAY_TOKEN,
      useClass: StellarService,
    },
  ],
  exports: [
    SubmitSettlementUseCase,
    VerifySettlementUseCase,
    CreateStellarAccountUseCase,
    BLOCKCHAIN_REPOSITORY_TOKEN,
    STELLAR_GATEWAY_TOKEN,
  ],
})
export class BlockchainSettlementModule {}
