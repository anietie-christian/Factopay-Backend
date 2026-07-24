// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { IsNotEmpty, IsString, IsOptional, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyMfaDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...', required: false })
  @IsString()
  @IsOptional()
  mfaToken?: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'MFA code must be exactly 6 digits' })
  code: string;
}
