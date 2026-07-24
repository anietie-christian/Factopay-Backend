// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminSuspendUserDto {
  @ApiProperty({ example: 'Suspicious activities or high chargeback rate detected.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason: string;
}
