import { IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiProperty({ example: '+491701234567', description: 'Updated user phone number in E.164 format', required: false })
  @IsOptional()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Phone number must be in E.164 format (e.g. +491701234567)' })
  phoneNumber?: string;

  @ApiProperty({ example: 'John', description: 'Updated first name', required: false })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({ example: 'Doe', description: 'Updated last name', required: false })
  @IsOptional()
  @IsString()
  lastName?: string;
}
