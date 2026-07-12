import { Controller, Post, Body, Headers, UseInterceptors, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequiresIdempotency } from '../../../shared/infrastructure/idempotency/requires-idempotency.decorator';
import { IdempotencyInterceptor } from '../../../shared/infrastructure/idempotency/idempotency.interceptor';
import { InitiateTransferUseCase } from '../../application/use-cases/initiate-transfer.use-case';
import { InitiateTransferDto } from '../../application/dtos/initiate-transfer.dto';
import { ApiTags, ApiOperation, ApiHeader, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Transfers')
@Controller('transfers')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
export class TransferController {
  constructor(private readonly initiateTransferUseCase: InitiateTransferUseCase) {}

  @Post()
  @ApiOperation({ summary: 'Initiate a new transfer' })
  @ApiHeader({ name: 'idempotency-key', required: true })
  @RequiresIdempotency()
  @UseInterceptors(IdempotencyInterceptor)
  async initiateTransfer(
    @Req() req: any,
    @Body() dto: InitiateTransferDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    const userId = req.user.id;
    return await this.initiateTransferUseCase.execute(userId, dto, idempotencyKey);
  }
}
