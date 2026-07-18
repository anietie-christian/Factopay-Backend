import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CurrencyCode } from '../../../shared/domain/value-objects/currency.vo';

export class GetLiveRatesDto {
  @ApiProperty({ example: 'USD', description: 'The currency you are converting from' })
  @IsEnum(['USD', 'EUR', 'GBP', 'GHS'])
  @IsNotEmpty()
  sourceCurrency: CurrencyCode;

  @ApiProperty({ example: 'GHS', description: 'The currency you are converting to' })
  @IsEnum(['USD', 'EUR', 'GBP', 'GHS'])
  @IsNotEmpty()
  targetCurrency: CurrencyCode;

  @ApiProperty({ example: 100, description: 'Optional amount to calculate fees', required: false })
  amount?: number;
}

export class LockQuoteDto extends GetLiveRatesDto {}
