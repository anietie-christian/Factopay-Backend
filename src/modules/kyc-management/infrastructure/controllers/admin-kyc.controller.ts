// ---------------------------------------------------------------------------------------------------------------#*eddiere
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  Ip,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../../shared/infrastructure/guards/roles.guard';
import { Roles } from '../../../shared/infrastructure/guards/roles.decorator';

import { AdminGetKycQueueUseCase } from '../../application/use-cases/admin-get-kyc-queue.use-case';
import { AdminGetKycDetailsUseCase } from '../../application/use-cases/admin-get-kyc-details.use-case';
import { AdminApproveKycUseCase } from '../../application/use-cases/admin-approve-kyc.use-case';
import { AdminRejectKycUseCase } from '../../application/use-cases/admin-reject-kyc.use-case';
import { AdminRequestResubmissionUseCase } from '../../application/use-cases/admin-request-resubmission.use-case';
import { AdminUpgradeKycTierUseCase } from '../../application/use-cases/admin-upgrade-kyc-tier.use-case';

import { AdminKycQueueQueryDto } from '../../application/dtos/admin-kyc-queue-query.dto';
import { AdminRejectKycDto } from '../../application/dtos/admin-reject-kyc.dto';
import { AdminRequestResubmissionDto } from '../../application/dtos/admin-request-resubmission.dto';
import { AdminUpgradeTierDto } from '../../application/dtos/admin-upgrade-tier.dto';

@ApiTags('Admin - KYC')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('admin/kyc')
export class AdminKycController {
  constructor(
    private readonly getKycQueueUseCase: AdminGetKycQueueUseCase,
    private readonly getKycDetailsUseCase: AdminGetKycDetailsUseCase,
    private readonly approveKycUseCase: AdminApproveKycUseCase,
    private readonly rejectKycUseCase: AdminRejectKycUseCase,
    private readonly requestResubmissionUseCase: AdminRequestResubmissionUseCase,
    private readonly upgradeKycTierUseCase: AdminUpgradeKycTierUseCase,
  ) {}

  @Get('queue')
  @Roles('SUPPORT', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get paginated KYC queue for admin review' })
  @ApiResponse({ status: 200, description: 'Returns filtered KYC queue with pagination' })
  async getQueue(@Query() query: AdminKycQueueQueryDto) {
    return this.getKycQueueUseCase.execute(query);
  }

  @Get(':userId/details')
  @Roles('SUPPORT', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get full KYC details for a specific user' })
  @ApiResponse({ status: 200, description: 'Returns user profile, documents, and verification history' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getDetails(@Param('userId') userId: string) {
    return this.getKycDetailsUseCase.execute(userId);
  }

  @Post(':userId/approve')
  @Roles('ADMIN', 'SUPERADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually approve KYC verification for a user' })
  @ApiResponse({ status: 200, description: 'KYC approved successfully' })
  @ApiResponse({ status: 400, description: 'User is already approved' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async approve(@Param('userId') userId: string, @Request() req: any, @Ip() ip: string) {
    return this.approveKycUseCase.execute(userId, req.user.id, req.user.email, ip);
  }

  @Post(':userId/reject')
  @Roles('ADMIN', 'SUPERADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually reject KYC verification for a user' })
  @ApiResponse({ status: 200, description: 'KYC rejected successfully' })
  @ApiResponse({ status: 400, description: 'User is already rejected' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async reject(
    @Param('userId') userId: string,
    @Body() dto: AdminRejectKycDto,
    @Request() req: any,
    @Ip() ip: string,
  ) {
    return this.rejectKycUseCase.execute(userId, dto, req.user.id, req.user.email, ip);
  }

  @Post(':userId/request-resubmission')
  @Roles('ADMIN', 'SUPERADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request KYC document resubmission from user' })
  @ApiResponse({ status: 200, description: 'Resubmission requested successfully' })
  @ApiResponse({ status: 400, description: 'Invalid KYC state for resubmission' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async requestResubmission(
    @Param('userId') userId: string,
    @Body() dto: AdminRequestResubmissionDto,
    @Request() req: any,
    @Ip() ip: string,
  ) {
    return this.requestResubmissionUseCase.execute(userId, dto, req.user.id, ip);
  }

  @Patch(':userId/upgrade-tier')
  @Roles('SUPERADMIN')
  @ApiOperation({ summary: 'Upgrade user KYC tier (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'KYC tier upgraded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid tier upgrade' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async upgradeTier(
    @Param('userId') userId: string,
    @Body() dto: AdminUpgradeTierDto,
    @Request() req: any,
    @Ip() ip: string,
  ) {
    return this.upgradeKycTierUseCase.execute(userId, dto, req.user.id, ip);
  }
}
