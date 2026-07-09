import { IsString, IsNotEmpty, IsDateString, IsOptional, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitBasicProfileDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    firstName: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    lastName: string;

    @ApiProperty({ example: '1990-01-31' })
    @IsDateString()
    dateOfBirth: Date;

    @ApiProperty({ example: 'NGA' })
    @IsString()
    @Length(3, 3)
    nationality: string;

    @ApiProperty({ example: 'DEU' })
    @IsString()
    @Length(3, 3)
    countryOfResidence: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    addressLine1: string;
}