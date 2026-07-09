import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../../shared/infrastructure/guards/roles.guard';
import { Roles } from '../../../shared/infrastructure/guards/roles.decorator';

import { AdminDashboardOverviewUseCase } from '../../application/use-cases/admin-dashboard-overview.use-case';
import { AdminGetAuditLogUseCase } from '../../application/use-cases/admin-get-audit-log.use-case';
import { AdminAuditLogQueryDto } from '../../application/dtos/admin-audit-log-query.dto';

@ApiTags('Admin - Dashboard & Ops')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(
    private readonly overviewUseCase: AdminDashboardOverviewUseCase,
    private readonly getAuditLogUseCase: AdminGetAuditLogUseCase,
  ) {}

  @Get('overview')
  @Roles('SUPPORT', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get main admin dashboard counts and metrics' })
  @ApiResponse({ status: 200, description: 'Returns system stats overview' })
  async getOverview() {
    return this.overviewUseCase.execute();
  }

  @Get('audit-logs')
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Retrieve privileged operations audit log' })
  @ApiResponse({ status: 200, description: 'Returns paginated list of audit actions' })
  async getAuditLogs(@Query() query: AdminAuditLogQueryDto) {
    return this.getAuditLogUseCase.execute(query);
  }

  @Get('health')
  @Roles('SUPPORT', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get service operational health state' })
  @ApiResponse({ status: 200, description: 'Returns basic service operational stats' })
  async getHealth() {
    return {
      status: 'UP',
      timestamp: new Date(),
      uptime: process.uptime(),
      version: '1.0.0',
    };
  }
}
