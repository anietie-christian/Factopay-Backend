import { Controller, Post, Body, Headers } from '@nestjs/common';
import { InitiateTransferUseCase } from '../../application/use-cases/initiate-transfer.use-case';
import { InitiateTransferDto } from '../../application/dtos/initiate-transfer.dto';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';

@ApiTags('Transfers')
@Controller('transfers')
export class TransferController {
  constructor(private readonly initiateTransferUseCase: InitiateTransferUseCase) {}

  @Post()
  @ApiOperation({ summary: 'Initiate a new transfer' })
  @ApiHeader({ name: 'idempotency-key', required: true })
  async initiateTransfer(
    @Body() dto: InitiateTransferDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    // Note: In a real app, userId comes from the JWT via a guard (e.g. @Req() req)
    // We mock it for the MVP step as requested.
    const mockUserId = '11111111-1111-1111-1111-111111111111';

    return await this.initiateTransferUseCase.execute(mockUserId, dto, idempotencyKey);
  }
}
