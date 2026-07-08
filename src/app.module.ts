import { Module } from '@nestjs/common';
import { SharedModule } from './modules/shared/shared.module';
import { AuthIdentityModule } from './modules/auth-identity/auth-identity.module';
import { TransferEngineModule } from './modules/transfer-engine/transfer-engine.module';
import { GatewayIntegrationsModule } from './modules/gateway-integrations/gateway-integrations.module';

@Module({
  imports: [
    SharedModule,
    AuthIdentityModule,
    TransferEngineModule,
    GatewayIntegrationsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}


