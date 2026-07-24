// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { IsNotEmpty, IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum SocialProvider {
  GOOGLE = 'GOOGLE',
  APPLE = 'APPLE',
}

export class SocialVerifyDto {
  @ApiProperty({ example: 'GOOGLE', enum: SocialProvider })
  @IsEnum(SocialProvider)
  provider: SocialProvider;

  @ApiProperty({ example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6...' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
