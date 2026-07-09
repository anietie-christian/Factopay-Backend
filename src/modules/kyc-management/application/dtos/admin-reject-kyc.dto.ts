import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminRejectKycDto {
  @ApiProperty({ example: 'Government ID is expired. Please resubmit a valid document.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason: string;
}
