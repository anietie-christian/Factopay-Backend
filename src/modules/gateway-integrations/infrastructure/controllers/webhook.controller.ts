import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
// In a real app, this would use a dedicated UseCase to process the payload
// and a DTO for the webhook payload.

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  @Post('flutterwave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive Flutterwave payment webhooks' })
  async handleFlutterwaveWebhook(@Body() payload: any) {
    this.logger.log(`Received Flutterwave webhook event: ${payload.event}`);

    // The payload signature is already verified by WebhookSignatureMiddleware
    switch (payload.event) {
      case 'charge.completed':
        // Find Transfer by tx_ref, update status to COMPLETED
        this.logger.log(`Payment successful for tx_ref: ${payload.data?.tx_ref}`);
        break;
      case 'charge.failed':
        // Find Transfer by tx_ref, update status to FAILED
        this.logger.error(`Payment failed for tx_ref: ${payload.data?.tx_ref}`);
        break;
      default:
        this.logger.warn(`Unhandled webhook event: ${payload.event}`);
    }

    return { success: true };
  }
}
