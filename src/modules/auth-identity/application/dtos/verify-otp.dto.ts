// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({ example: 'userId-uuid-string-here', description: 'User ID associated with the OTP' })
  @IsNotEmpty({ message: 'User ID is required' })
  @IsString()
  userId!: string;

  @ApiProperty({ example: '123456', description: '6-digit OTP code received by SMS/Email' })
  @IsNotEmpty({ message: 'OTP code is required' })
  @Length(6, 6, { message: 'OTP code must be exactly 6 digits' })
  code!: string;

  @ApiProperty({ example: 'SMS', description: 'OTP type: EMAIL or SMS' })
  @IsNotEmpty({ message: 'OTP type is required' })
  @IsString()
  type!: 'EMAIL' | 'SMS';
}
