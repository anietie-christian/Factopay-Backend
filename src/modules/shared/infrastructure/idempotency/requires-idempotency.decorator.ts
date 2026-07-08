import { SetMetadata } from '@nestjs/common';

export const REQUIRES_IDEMPOTENCY_KEY = 'requires_idempotency';

/**
 * Decorator to enforce Idempotency checks on an endpoint.
 * Requires the client to send an `Idempotency-Key` header.
 */
export const RequiresIdempotency = () => SetMetadata(REQUIRES_IDEMPOTENCY_KEY, true);
