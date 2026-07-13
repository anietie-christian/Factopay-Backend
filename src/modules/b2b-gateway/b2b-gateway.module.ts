import { Module } from '@nestjs/common';
import { ApiKeyService } from './application/services/api-key.service';
import { B2bTransfersController } from './infrastructure/controllers/b2b-transfers.controller';
import { GatewayApiKeyGuard } from './infrastructure/guards/gateway-api-key.guard';
import { SharedModule } from '../shared/shared.module';
import { TransferEngineModule } from '../transfer-engine/transfer-engine.module';

@Module({
  imports: [SharedModule, TransferEngineModule],
  controllers: [B2bTransfersController],
  providers: [ApiKeyService, GatewayApiKeyGuard],
  exports: [ApiKeyService],
})
export class B2bGatewayModule {}
