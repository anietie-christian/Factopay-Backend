import { Module, Global } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditLoggerService } from './application/services/audit-logger.service';
import { AuditInterceptor } from './infrastructure/interceptors/audit.interceptor';
import { SharedModule } from '../shared/shared.module';
import { SlackAlertService } from './infrastructure/services/slack-alert.service';
import { AmlRuleEngineService } from './application/services/aml-rule-engine.service';

@Global()
@Module({
  imports: [SharedModule],
  providers: [
    AuditLoggerService, 
    AuditInterceptor, 
    SlackAlertService, 
    AmlRuleEngineService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    }
  ],
  exports: [AuditLoggerService, AuditInterceptor, SlackAlertService, AmlRuleEngineService],
})
export class AuditModule {}
