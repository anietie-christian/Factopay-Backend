// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Controller, Get, Post, Param, Query, UseGuards, Request, Ip, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../../shared/infrastructure/guards/roles.guard';
import { Roles } from '../../../shared/infrastructure/guards/roles.decorator';

import { GetComplianceMetricsUseCase } from '../../application/use-cases/get-compliance-metrics.use-case';
import { ReviewAlertUseCase } from '../../application/use-cases/review-alert.use-case';
import { ListAlertsUseCase } from '../../application/use-cases/list-alerts.use-case';

@ApiTags('Admin - Compliance & AML')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('compliance')
export class ComplianceController {
  constructor(
    private readonly getMetricsUseCase: GetComplianceMetricsUseCase,
    private readonly reviewAlertUseCase: ReviewAlertUseCase,
    private readonly listAlertsUseCase: ListAlertsUseCase,
  ) {}

  @Get('metrics')
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get high-level compliance aggregation metrics' })
  @ApiResponse({ status: 200, description: 'Returns compliance status metrics' })
  async getMetrics() {
    return this.getMetricsUseCase.execute();
  }

  @Get('alerts')
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'List and filter AML security alerts' })
  @ApiResponse({ status: 200, description: 'Returns paginated list of alerts' })
  async listAlerts(
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.listAlertsUseCase.execute({ status, severity, page, limit });
  }

  @Post('alerts/:id/review')
  @Roles('ADMIN', 'SUPERADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Review and resolve an open AML alert' })
  @ApiResponse({ status: 200, description: 'Alert reviewed and resolved successfully' })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  @ApiResponse({ status: 400, description: 'Alert already reviewed' })
  async reviewAlert(
    @Param('id') alertId: string,
    @Request() req: any,
    @Ip() ip: string,
  ) {
    return this.reviewAlertUseCase.execute(alertId, req.user.id, ip);
  }
}
