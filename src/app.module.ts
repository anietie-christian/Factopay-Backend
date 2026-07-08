import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { SharedModule } from './modules/shared/shared.module';
import { AuthIdentityModule } from './modules/auth-identity/auth-identity.module';
import { TransferEngineModule } from './modules/transfer-engine/transfer-engine.module';
import { GatewayIntegrationsModule } from './modules/gateway-integrations/gateway-integrations.module';

@Module({
  imports: [
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
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}


