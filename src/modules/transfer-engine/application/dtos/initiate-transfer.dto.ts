import { IsUUID, IsNumberString, IsString, Length } from 'class-validator';

export class InitiateTransferDto {
  @IsNumberString({}, { message: 'Amount must be a valid number string to maintain precision' })
  amount: string;

  @IsString()
  @Length(3, 5)
  currency: string;

  @IsUUID('4', { message: 'recipientId must be a valid UUID' })
  recipientId: string;

  @IsUUID('4', { message: 'quoteId must be a valid UUID' })
  quoteId: string;
}
