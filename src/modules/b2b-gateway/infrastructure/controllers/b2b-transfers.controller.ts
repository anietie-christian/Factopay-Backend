import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { GatewayApiKeyGuard } from '../../infrastructure/guards/gateway-api-key.guard';
import { ApiKeyThrottlerGuard } from '../../infrastructure/guards/api-key-throttler.guard';
import { InitiateTransferUseCase } from '../../../transfer-engine/application/use-cases/initiate-transfer.use-case';
import { InitiateTransferDto } from '../../../transfer-engine/application/dtos/initiate-transfer.dto';
import { GatewayResponseDto } from '../../infrastructure/dto/gateway-responses.dto';
import { Throttle, SkipThrottle } from '@nestjs/throttler';

@SkipThrottle({ default: false })
@Controller('api/v1/gateway/transfers')
@UseGuards(GatewayApiKeyGuard, ApiKeyThrottlerGuard)
export class B2bTransfersController {
  constructor(private readonly initiateTransferUseCase: InitiateTransferUseCase) {}

  @Throttle({ default: { limit: 10, ttl: 1000 } }) // Max 10 requests per second
  @Post()
  async initiateTransfer(@Req() request: any, @Body() dto: InitiateTransferDto) {
    const userId = request.user.id;
    const idempotencyKey = request.headers['idempotency-key'] || `b2b-${Date.now()}-${Math.random()}`;

    const result = await this.initiateTransferUseCase.execute(userId, dto, idempotencyKey as string);

    return new GatewayResponseDto({
      success: true,
      data: result,
      metadata: {
        idempotencyKey,
      },
    });
  }
}
