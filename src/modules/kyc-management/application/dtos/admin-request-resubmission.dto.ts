import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminRequestResubmissionDto {
  @ApiProperty({ example: 'Please upload a clearer photo of your proof of address.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message: string;
}
