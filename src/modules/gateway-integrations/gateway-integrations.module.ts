import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { WebhookController } from './infrastructure/controllers/webhook.controller';
import { TransakWebhookController } from './infrastructure/controllers/transak-webhook.controller';
import { WebhookSignatureMiddleware } from './infrastructure/middleware/webhook-signature.middleware';
import { TransakSignatureMiddleware } from './infrastructure/middleware/transak-signature.middleware';
import { BullModule } from '@nestjs/bullmq';
import { WebhookProcessor } from './application/processors/webhook.processor';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { webhookBackoffStrategy } from './infrastructure/bullmq/custom-backoff';
import { bullBoardAuthMiddleware } from './infrastructure/middleware/bull-board-auth.middleware';
import { OutboundWebhookService } from './application/services/outbound-webhook.service';
import { RecordWebhookEventUseCase } from './application/use-cases/record-webhook-event.use-case';
import { BlockchainReconciliationWorker } from './application/workers/blockchain-reconciliation.worker';
import { WebhookReconciliationWorker } from './application/workers/webhook-reconciliation.worker';
import { BlockchainSettlementModule } from '../blockchain-settlement/blockchain-settlement.module';
import { WalletLedgerModule } from '../wallet-ledger/wallet-ledger.module';

@Module({
  imports: [
    SharedModule,
    BlockchainSettlementModule,
    WalletLedgerModule,
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'redis',
        port: Number(process.env.REDIS_PORT) || 6379,
      },
    }),
    BullModule.registerQueue({
      name: 'webhook-dlq',
    }),
    BullBoardModule.forRoot({
      route: '/admin/queues',
      middleware: [bullBoardAuthMiddleware],
      adapter: ExpressAdapter,
    }),
    BullBoardModule.forFeature({
      name: 'webhook-dlq',
      adapter: BullMQAdapter as any,
    }),
  ],
  controllers: [WebhookController, TransakWebhookController],
  providers: [
    WebhookProcessor,
    OutboundWebhookService,
    RecordWebhookEventUseCase,
    BlockchainReconciliationWorker,
    WebhookReconciliationWorker,
  ],
  exports: [OutboundWebhookService, RecordWebhookEventUseCase],
})
export class GatewayIntegrationsModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(WebhookSignatureMiddleware)
      .forRoutes({ path: 'webhooks/flutterwave', method: RequestMethod.POST });
    
    consumer
      .apply(TransakSignatureMiddleware)
      .forRoutes({ path: 'webhooks/transak', method: RequestMethod.POST });
  }
}
