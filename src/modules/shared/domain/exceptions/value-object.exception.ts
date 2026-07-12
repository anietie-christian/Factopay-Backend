import { FactoPayException } from './factopay.exception';
import { HttpStatus } from '@nestjs/common';

export class InvalidMoneyException extends FactoPayException {
  constructor(message: string = 'Invalid money value provided') {
    super(message, 'INVALID_MONEY_VALUE', HttpStatus.BAD_REQUEST);
  }
}

export class InvalidCurrencyException extends FactoPayException {
  constructor(currencyCode: string) {
    super(`Unsupported or invalid currency code: ${currencyCode}`, 'INVALID_CURRENCY', HttpStatus.BAD_REQUEST);
  }
}

export class InvalidUuidException extends FactoPayException {
  constructor(message: string = 'Invalid UUID v4 format provided') {
    super(message, 'INVALID_UUID_FORMAT', HttpStatus.BAD_REQUEST);
  }
}
