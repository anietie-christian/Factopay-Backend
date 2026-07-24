// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { IsNotEmpty, IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateOtpDto {
  @ApiProperty({ example: 'userId-uuid-string-here', description: 'User ID to generate OTP for' })
  @IsNotEmpty({ message: 'User ID is required' })
  @IsString()
  userId!: string;

  @ApiProperty({ example: 'SMS', description: 'OTP type: EMAIL or SMS' })
  @IsNotEmpty({ message: 'OTP type is required' })
  @IsEnum(['EMAIL', 'SMS'])
  type!: 'EMAIL' | 'SMS';
}
