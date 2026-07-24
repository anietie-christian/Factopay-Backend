// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { IsString, IsNotEmpty, IsDateString, IsOptional, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BasicProfile } from '../../domain/repositories/kyc.repository.interface';

export class SubmitBasicProfileDto implements Omit<BasicProfile, 'dateOfBirth'> {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    firstName: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    lastName: string;

    @ApiProperty({ example: '1990-01-31', description: 'Date of birth in YYYY-MM-DD format' })
    @IsDateString()
    dateOfBirth: Date;

    @ApiProperty({ example: 'NGA', description: '3-letter ISO country code' })
    @IsString()
    @Length(3, 3)
    nationality: string;

    @ApiProperty({ example: 'DEU', description: '3-letter ISO country code' })
    @IsString()
    @Length(3, 3)
    countryOfResidence: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    addressLine1: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    addressLine2?: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    city: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    postalCode: string;
}