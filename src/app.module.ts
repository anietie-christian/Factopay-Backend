import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SharedModule } from './modules/shared/shared.module';
import { AuthIdentityModule } from './modules/auth-identity/auth-identity.module';
import { TransferEngineModule } from './modules/transfer-engine/transfer-engine.module';
import { GatewayIntegrationsModule } from './modules/gateway-integrations/gateway-integrations.module';
import { KycManagementModule } from './modules/kyc-management/kyc-management.module';
import { WalletLedgerModule } from './modules/wallet-ledger/wallet-ledger.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 120, // default limit: 120 requests per minute
      },
    ]),
    EventEmitterModule.forRoot(),
    SharedModule,
    AuthIdentityModule,
    TransferEngineModule,
    GatewayIntegrationsModule,
    KycManagementModule,
    WalletLedgerModule,
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
