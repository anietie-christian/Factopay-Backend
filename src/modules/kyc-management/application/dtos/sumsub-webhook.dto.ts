import { Type } from 'class-transformer';
import { IsString, IsOptional, ValidateNested, IsIn } from 'class-validator';

class ReviewResultDto {
    @IsIn(['GREEN', 'RED'])
    reviewAnswer: 'GREEN' | 'RED';

    @IsOptional()
    @IsString({ each: true })
    rejectLabels?: string[];

    @IsOptional()
    @IsString()
    moderationComment?: string;
}

export class SumsubWebhookDto {
    @IsString()
    applicantId: string; // This is the externalId from Sumsub

    @IsString()
    externalUserId: string; // This maps directly to our internal user.id

    @IsString()
    type: string; // e.g. "applicantReviewed"

    @IsOptional()
    @ValidateNested()
    @Type(() => ReviewResultDto)
    reviewResult?: ReviewResultDto;
}