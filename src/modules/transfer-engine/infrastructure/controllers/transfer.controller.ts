import { Controller, Post, Get, Body, Param, Query, Headers, UseInterceptors, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequiresIdempotency } from '../../../shared/infrastructure/idempotency/requires-idempotency.decorator';
import { IdempotencyInterceptor } from '../../../shared/infrastructure/idempotency/idempotency.interceptor';
import { InitiateTransferUseCase } from '../../application/use-cases/initiate-transfer.use-case';
import { GetTransferUseCase } from '../../application/use-cases/get-transfer.use-case';
import { GetTransferByKeyUseCase } from '../../application/use-cases/get-transfer-by-key.use-case';
import { ListTransfersUseCase } from '../../application/use-cases/list-transfers.use-case';
import { UserCancelTransferUseCase } from '../../application/use-cases/user-cancel-transfer.use-case';
import { InitiateTransferDto } from '../../application/dtos/initiate-transfer.dto';
import { ListTransfersQueryDto } from '../../application/dtos/list-transfers-query.dto';
import { ApiTags, ApiOperation, ApiHeader, ApiBearerAuth, ApiParam, ApiResponse } from '@nestjs/swagger';

@ApiTags('Transfers')
@Controller('transfers')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
export class TransferController {
  constructor(
    private readonly initiateTransferUseCase: InitiateTransferUseCase,
    private readonly getTransferUseCase: GetTransferUseCase,
    private readonly getTransferByKeyUseCase: GetTransferByKeyUseCase,
    private readonly listTransfersUseCase: ListTransfersUseCase,
    private readonly userCancelTransferUseCase: UserCancelTransferUseCase,
  ) {}

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

  @Get()
  @ApiOperation({ summary: 'List transfers for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Paginated list of transfers' })
  async listTransfers(
    @Req() req: any,
    @Query() query: ListTransfersQueryDto,
  ) {
    return this.listTransfersUseCase.execute(req.user.id, {
      status: query.status,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  @Get('by-key/:idempotencyKey')
  @ApiOperation({ summary: 'Lookup transfer by idempotency key' })
  @ApiParam({ name: 'idempotencyKey', description: 'The idempotency key used during transfer creation' })
  @ApiResponse({ status: 200, description: 'Transfer found' })
  @ApiResponse({ status: 404, description: 'Transfer not found for this key' })
  async getByKey(
    @Req() req: any,
    @Param('idempotencyKey') idempotencyKey: string,
  ) {
    return this.getTransferByKeyUseCase.execute(req.user.id, idempotencyKey);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Poll transfer status' })
  @ApiParam({ name: 'id', description: 'Transfer UUID' })
  @ApiResponse({ status: 200, description: 'Transfer status retrieved' })
  @ApiResponse({ status: 404, description: 'Transfer not found' })
  async getStatus(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const transfer = await this.getTransferUseCase.execute(req.user.id, id);
    return { status: transfer.status };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transfer by ID' })
  @ApiParam({ name: 'id', description: 'Transfer UUID' })
  @ApiResponse({ status: 200, description: 'Transfer found' })
  @ApiResponse({ status: 404, description: 'Transfer not found' })
  async getById(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.getTransferUseCase.execute(req.user.id, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a pending transfer' })
  @ApiParam({ name: 'id', description: 'Transfer UUID' })
  @ApiResponse({ status: 200, description: 'Transfer cancelled successfully' })
  @ApiResponse({ status: 400, description: 'Transfer cannot be cancelled' })
  @ApiResponse({ status: 404, description: 'Transfer not found' })
  async cancelTransfer(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.userCancelTransferUseCase.execute(req.user.id, id);
  }
}
