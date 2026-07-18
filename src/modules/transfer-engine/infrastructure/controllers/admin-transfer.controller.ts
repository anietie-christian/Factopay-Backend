import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Query,
  Req,
  Ip,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../../shared/infrastructure/guards/roles.guard';
import { Roles } from '../../../shared/infrastructure/guards/roles.decorator';
import { AdminListTransfersUseCase } from '../../application/use-cases/admin-list-transfers.use-case';
import { AdminReviewTransferUseCase } from '../../application/use-cases/admin-review-transfer.use-case';
import { AdminCancelTransferUseCase } from '../../application/use-cases/admin-cancel-transfer.use-case';
import { AdminResolveTransferUseCase } from '../../application/use-cases/admin-resolve-transfer.use-case';
import { AdminRetryTransferUseCase } from '../../application/use-cases/admin-retry-transfer.use-case';
import { AdminRefundTransferUseCase } from '../../application/use-cases/admin-refund-transfer.use-case';
import {
  AdminListTransfersQueryDto,
  AdminReviewTransferDto,
  AdminCancelTransferDto,
  AdminResolveTransferDto,
  AdminRetryTransferDto,
  AdminRefundTransferDto,
} from '../../application/dtos/admin-transfer.dto';

@ApiTags('Admin - Transfers')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('admin/transfers')
export class AdminTransferController {
  constructor(
    private readonly listTransfersUseCase: AdminListTransfersUseCase,
    private readonly reviewTransferUseCase: AdminReviewTransferUseCase,
    private readonly cancelTransferUseCase: AdminCancelTransferUseCase,
    private readonly resolveTransferUseCase: AdminResolveTransferUseCase,
    private readonly retryTransferUseCase: AdminRetryTransferUseCase,
    private readonly refundTransferUseCase: AdminRefundTransferUseCase,
  ) {}

  @Get()
  @Roles('SUPPORT', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'List and search all transfers (Admin/Support)' })
  @ApiResponse({ status: 200, description: 'Paginated list of transfers' })
  async listTransfers(@Query() query: AdminListTransfersQueryDto) {
    return this.listTransfersUseCase.execute(query);
  }

  @Post(':id/review')
  @Roles('ADMIN', 'SUPERADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Review and approve/reject a pending transfer' })
  @ApiResponse({ status: 200, description: 'Transfer reviewed successfully' })
  async reviewTransfer(
    @Param('id') id: string,
    @Body() dto: AdminReviewTransferDto,
    @Req() req: any,
    @Ip() ipAddress: string,
  ) {
    const adminId = req.user.id;
    return this.reviewTransferUseCase.execute({
      transferId: id,
      adminId,
      decision: dto.decision,
      notes: dto.notes,
      ipAddress,
    });
  }

  @Post(':id/cancel')
  @Roles('ADMIN', 'SUPERADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually cancel a pending/stuck transfer and reverse ledger entries' })
  @ApiResponse({ status: 200, description: 'Transfer cancelled and ledger reversed successfully' })
  async cancelTransfer(
    @Param('id') id: string,
    @Body() dto: AdminCancelTransferDto,
    @Req() req: any,
    @Ip() ipAddress: string,
  ) {
    const adminId = req.user.id;
    return this.cancelTransferUseCase.execute({
      transferId: id,
      adminId,
      reason: dto.reason,
      ipAddress,
    });
  }

  @Post(':id/resolve')
  @Roles('ADMIN', 'SUPERADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually resolve/complete a stuck transfer (e.g. verified on-chain externally)' })
  @ApiResponse({ status: 200, description: 'Transfer manually completed successfully' })
  async resolveTransfer(
    @Param('id') id: string,
    @Body() dto: AdminResolveTransferDto,
    @Req() req: any,
    @Ip() ipAddress: string,
  ) {
    const adminId = req.user.id;
    return this.resolveTransferUseCase.execute({
      transferId: id,
      adminId,
      notes: dto.notes,
      ipAddress,
    });
  }

  @Post(':id/retry')
  @Roles('ADMIN', 'SUPERADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry a failed transfer' })
  @ApiResponse({ status: 200, description: 'Transfer status set to PENDING and enqueued for retry' })
  async retryTransfer(
    @Param('id') id: string,
    @Body() dto: AdminRetryTransferDto,
    @Req() req: any,
    @Ip() ipAddress: string,
  ) {
    const adminId = req.user.id;
    return this.retryTransferUseCase.execute({
      transferId: id,
      adminId,
      notes: dto.notes,
      ipAddress,
    });
  }

  @Post(':id/refund')
  @Roles('ADMIN', 'SUPERADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refund a failed or stuck transfer to user wallet' })
  @ApiResponse({ status: 200, description: 'Transfer refunded successfully' })
  async refundTransfer(
    @Param('id') id: string,
    @Body() dto: AdminRefundTransferDto,
    @Req() req: any,
    @Ip() ipAddress: string,
  ) {
    const adminId = req.user.id;
    return this.refundTransferUseCase.execute({
      transferId: id,
      adminId,
      reason: dto.reason,
      ipAddress,
    });
  }
}
