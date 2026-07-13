import { SetMetadata } from '@nestjs/common';

export const AUDIT_LOG_METADATA_KEY = 'audit_log';

export interface AuditLogOptions {
  action: string;
  targetType?: string;
}

export const AuditLog = (options: string | AuditLogOptions) => {
  const metadata = typeof options === 'string' ? { action: options } : options;
  return SetMetadata(AUDIT_LOG_METADATA_KEY, metadata);
};
