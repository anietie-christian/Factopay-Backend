import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditLoggerService } from '../../application/services/audit-logger.service';
import { AUDIT_LOG_METADATA_KEY, AuditLogOptions } from '../../domain/decorators/audit-log.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const auditOptions = this.reflector.getAllAndOverride<AuditLogOptions>(
      AUDIT_LOG_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest();
    const { user, ip, body, params, query, method, url } = request;
    
    // Attempt to parse a target ID from response or request
    const targetId = params?.id || body?.id || null;

    let action = `[${method}] ${url}`;
    let targetType = 'ENDPOINT';
    
    if (auditOptions) {
      action = auditOptions.action;
      if (auditOptions.targetType) {
        targetType = auditOptions.targetType;
      }
    }

    const userId = user?.sub || user?.id || null; // standard JWT payload mappings
    const ipAddress = ip;
    
    const metadata = {
      body,
      query,
      params,
    };

    return next.handle().pipe(
      tap({
        next: (data: any) => {
          // Fire-and-forget log on successful request
          const finalTargetId = data?.id || targetId; // Attempt to get ID from response if not in request
          this.auditLogger.logAction({
            userId,
            action,
            targetType,
            targetId: finalTargetId,
            ipAddress,
            metadata: {
              request: metadata,
              // Optionally we could log response data, but be careful with PII
            },
          });
        },
        error: (err: any) => {
          // We can also log failed attempts if needed
          this.auditLogger.logAction({
            userId,
            action: `${action}_FAILED`,
            targetType,
            targetId,
            ipAddress,
            metadata: {
              request: metadata,
              error: err.message || err.name,
            },
          });
        }
      }),
    );
  }
}
