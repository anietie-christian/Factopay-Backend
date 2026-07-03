export class FactoPayException extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number = 400
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class InsufficientBalanceException extends FactoPayException {
  constructor(message = 'Insufficient balance for this operation.') {
    super('INSUFFICIENT_BALANCE', message, 400);
  }
}

export class IdempotencyConflictException extends FactoPayException {
  constructor(message = 'A request with this idempotency key is already in progress.') {
    super('IDEMPOTENCY_CONFLICT', message, 409);
  }
}

export class KycNotApprovedException extends FactoPayException {
  constructor(message = 'User KYC is not approved for this operation.') {
    super('KYC_NOT_APPROVED', message, 403);
  }
}

export class FxQuoteExpiredException extends FactoPayException {
  constructor(message = 'The FX quote has expired and must be refreshed.') {
    super('FX_QUOTE_EXPIRED', message, 400);
  }
}

export class TransferNotFoundException extends FactoPayException {
  constructor(message = 'The specified transfer could not be found.') {
    super('TRANSFER_NOT_FOUND', message, 404);
  }
}

export class BlockchainFailedException extends FactoPayException {
  constructor(message = 'The blockchain transaction failed to confirm.') {
    super('BLOCKCHAIN_FAILED', message, 502);
  }
}

export class RateLimitExceededException extends FactoPayException {
  constructor(message = 'Rate limit exceeded. Please try again later.') {
    super('RATE_LIMIT_EXCEEDED', message, 429);
  }
}
