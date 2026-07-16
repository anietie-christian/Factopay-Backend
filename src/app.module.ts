import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { SharedModule } from './modules/shared/shared.module';
import { AuthIdentityModule } from './modules/auth-identity/auth-identity.module';
import { TransferEngineModule } from './modules/transfer-engine/transfer-engine.module';
import { GatewayIntegrationsModule } from './modules/gateway-integrations/gateway-integrations.module';
import { KycManagementModule } from './modules/kyc-management/kyc-management.module';
import { BlockchainSettlementModule } from './modules/blockchain-settlement/blockchain-settlement.module';
import { WalletLedgerModule } from './modules/wallet-ledger/wallet-ledger.module';
import { NotificationModule } from './modules/notification-service/notification.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuditModule } from './modules/audit/audit.module';
import { AuditComplianceModule } from './modules/audit-compliance/audit-compliance.module';
import { secretsLoader } from './config/secrets.loader';
import { RewardsPointsModule } from './modules/rewards-points/rewards-points.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [secretsLoader],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 120, // default limit: 120 requests per minute
      },
    ]),
    SharedModule,
    AuthIdentityModule,
    TransferEngineModule,
    GatewayIntegrationsModule,
    KycManagementModule,
    BlockchainSettlementModule,
    WalletLedgerModule,
    NotificationModule,
    AuditModule,
    AuditComplianceModule,
    RewardsPointsModule,
    EventEmitterModule.forRoot(),
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }
