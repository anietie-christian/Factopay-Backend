import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { WebhookController } from './infrastructure/controllers/webhook.controller';
import { WebhookSignatureMiddleware } from './infrastructure/middleware/webhook-signature.middleware';
import { BullModule } from '@nestjs/bullmq';
import { WebhookProcessor } from './application/processors/webhook.processor';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { webhookBackoffStrategy } from './infrastructure/bullmq/custom-backoff';
@Module({
  imports: [
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
      route: '/api/v1/admin/queues',
      adapter: ExpressAdapter,
    }),
    BullBoardModule.forFeature({
      name: 'webhook-dlq',
      adapter: BullMQAdapter as any,
    }),
  ],
  controllers: [WebhookController],
  providers: [WebhookProcessor],
})
export class GatewayIntegrationsModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(WebhookSignatureMiddleware)
      .forRoutes({ path: 'webhooks/flutterwave', method: RequestMethod.POST });
  }
}
