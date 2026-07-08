import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { WebhookController } from './infrastructure/controllers/webhook.controller';
import { WebhookSignatureMiddleware } from './infrastructure/middleware/webhook-signature.middleware';

@Module({
  controllers: [WebhookController],
})
export class GatewayIntegrationsModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(WebhookSignatureMiddleware)
      .forRoutes({ path: 'webhooks/flutterwave', method: RequestMethod.POST });
  }
}
