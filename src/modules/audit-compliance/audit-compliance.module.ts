import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { ComplianceController } from './infrastructure/controllers/compliance.controller';
import { GetComplianceMetricsUseCase } from './application/use-cases/get-compliance-metrics.use-case';
import { ReviewAlertUseCase } from './application/use-cases/review-alert.use-case';
import { ListAlertsUseCase } from './application/use-cases/list-alerts.use-case';

@Module({
  imports: [SharedModule],
  controllers: [ComplianceController],
  providers: [
    GetComplianceMetricsUseCase,
    ReviewAlertUseCase,
    ListAlertsUseCase,
  ],
  exports: [
    GetComplianceMetricsUseCase,
    ReviewAlertUseCase,
    ListAlertsUseCase,
  ],
})
export class AuditComplianceModule {}
