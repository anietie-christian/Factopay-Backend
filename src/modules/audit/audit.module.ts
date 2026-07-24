// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Module, Global } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditLoggerService } from './application/services/audit-logger.service';
import { AuditInterceptor } from './infrastructure/interceptors/audit.interceptor';
import { SharedModule } from '../shared/shared.module';
import { SlackAlertService } from './infrastructure/services/slack-alert.service';
import { AmlRuleEngineService } from './application/services/aml-rule-engine.service';

import { ComplianceController } from './infrastructure/controllers/compliance.controller';
import { GetComplianceMetricsUseCase } from './application/use-cases/get-compliance-metrics.use-case';
import { ReviewAlertUseCase } from './application/use-cases/review-alert.use-case';
import { ListAlertsUseCase } from './application/use-cases/list-alerts.use-case';

@Global()
@Module({
  imports: [SharedModule],
  controllers: [ComplianceController],
  providers: [
    AuditLoggerService, 
    AuditInterceptor, 
    SlackAlertService, 
    AmlRuleEngineService,
    GetComplianceMetricsUseCase,
    ReviewAlertUseCase,
    ListAlertsUseCase,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    }
  ],
  exports: [
    AuditLoggerService, 
    AuditInterceptor, 
    SlackAlertService, 
    AmlRuleEngineService,
    GetComplianceMetricsUseCase,
    ReviewAlertUseCase,
    ListAlertsUseCase,
  ],
})
export class AuditModule {}
