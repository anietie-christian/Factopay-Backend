import { Test, TestingModule } from '@nestjs/testing';
import { SubmitBasicProfileUseCase } from '../application/use-cases/submit-basic-profile.use-case';
import { InitiateKycCheckUseCase } from '../application/use-cases/initiate-kyc-check.use-case';
import { HandleKycWebhookUseCase } from '../application/use-cases/handle-kyc-webhook.use-case';
import { GetKycStatusUseCase } from '../application/use-cases/get-kyc-status.use-case';
import { IKycRepository, KYC_REPOSITORY_TOKEN } from '../domain/repositories/kyc.repository.interface';
import { IKycProvider, KYC_PROVIDER_TOKEN } from '../application/ports/kyc-provider.interface';
import { User, KycStatus, Role } from '../../auth-identity/domain/models/user.model';
import { UserNotFoundException } from '../../shared/domain/exceptions/factopay.exception';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { SubmitBasicProfileDto } from '../application/dtos/submit-basic-profile.dto';
import { KycAttemptStatus, KycVerificationAttempt } from '../domain/models/kyc-attempt.model';
import { ConfigService } from '@nestjs/config';
import { SumsubWebhookDto } from '../application/dtos/sumsub-webhook.dto';
import * as crypto from 'crypto';
import { RecordWebhookEventUseCase } from '../../gateway-integrations/application/use-cases/record-webhook-event.use-case';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('KYC Management Use Cases', () => {
    let submitBasicProfileUseCase: SubmitBasicProfileUseCase;
    let initiateKycCheckUseCase: InitiateKycCheckUseCase;
    let handleKycWebhookUseCase: HandleKycWebhookUseCase;
    let getKycStatusUseCase: GetKycStatusUseCase;
    let mockKycRepository: jest.Mocked<IKycRepository>;
    let mockKycProvider: jest.Mocked<IKycProvider>;
    let mockConfigService: jest.Mocked<ConfigService>;
    let mockRecordWebhookEventUseCase: jest.Mocked<RecordWebhookEventUseCase>;

    const mockUser = new User(
        'user-123',
        'test@example.com',
        '+1234567890',
        'hashed-password',
        true,
        true,
        KycStatus.UNVERIFIED,
        'NONE',
        Role.USER,
        true,
        null,
        new Date(),
        new Date(),
    );

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SubmitBasicProfileUseCase,
                InitiateKycCheckUseCase,
                HandleKycWebhookUseCase,
                GetKycStatusUseCase,
                {
                    provide: RecordWebhookEventUseCase,
                    useValue: {
                        execute: jest.fn().mockResolvedValue({ isDuplicate: false, status: 'RECEIVED' }),
                        updateStatus: jest.fn().mockResolvedValue({}),
                    },
                },
                {
                    provide: KYC_REPOSITORY_TOKEN,
                    useValue: {
                        findUserById: jest.fn(),
                        saveBasicProfile: jest.fn(),
                        updateUserKyc: jest.fn(),
                        createVerificationAttempt: jest.fn(),
                        findAttemptByExternalId: jest.fn(),
                        updateVerificationAttempt: jest.fn(),
                        findDocumentsByUserId: jest.fn(),
                        findLatestAttemptByUserId: jest.fn(),
                    },
                },
                {
                    provide: KYC_PROVIDER_TOKEN,
                    useValue: {
                        createVerificationSession: jest.fn(),
                    },
                },
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn(),
                    },
                },
                {
                    provide: EventEmitter2,
                    useValue: {
                        emit: jest.fn(),
                    },
                },
            ],
        }).compile();

        submitBasicProfileUseCase = module.get<SubmitBasicProfileUseCase>(SubmitBasicProfileUseCase);
        initiateKycCheckUseCase = module.get<InitiateKycCheckUseCase>(InitiateKycCheckUseCase);
        handleKycWebhookUseCase = module.get<HandleKycWebhookUseCase>(HandleKycWebhookUseCase);
        getKycStatusUseCase = module.get<GetKycStatusUseCase>(GetKycStatusUseCase);
        mockKycRepository = module.get(KYC_REPOSITORY_TOKEN);
        mockKycProvider = module.get(KYC_PROVIDER_TOKEN);
        mockConfigService = module.get(ConfigService);
        mockRecordWebhookEventUseCase = module.get(RecordWebhookEventUseCase);
    });

    describe('SubmitBasicProfileUseCase', () => {
        it('should successfully save a basic profile and transition user to TIER_1', async () => {
            // Arrange
            const dto = new SubmitBasicProfileDto();
            Object.assign(dto, {
                firstName: 'John',
                lastName: 'Doe',
                dateOfBirth: new Date('1990-01-15'),
                nationality: 'NGA',
                countryOfResidence: 'DEU',
                addressLine1: '123 Main St',
                city: 'Berlin',
                postalCode: '10115',
            });
            const updatedUser = { ...mockUser, kycTier: 'TIER_1', kycStatus: KycStatus.APPROVED };

            mockKycRepository.findUserById.mockResolvedValue(mockUser);
            mockKycRepository.updateUserKyc.mockResolvedValue(updatedUser as User);

            // Act
            const result = await submitBasicProfileUseCase.execute(mockUser.id, dto);

            // Assert
            expect(mockKycRepository.saveBasicProfile).toHaveBeenCalledWith(mockUser.id, dto);
            expect(mockKycRepository.updateUserKyc).toHaveBeenCalledWith(mockUser.id, 'APPROVED', 'TIER_1');
            expect(result).toEqual({
                userId: mockUser.id,
                kycTier: 'TIER_1',
                kycStatus: 'APPROVED',
            });
        });

        it('should throw UserNotFoundException if the user does not exist', async () => {
            // Arrange
            mockKycRepository.findUserById.mockResolvedValue(null);

            // Act & Assert
            await expect(submitBasicProfileUseCase.execute('non-existent-user', new SubmitBasicProfileDto())).rejects.toThrow(UserNotFoundException);
        });
    });

    describe('InitiateKycCheckUseCase', () => {
        it('should initiate a KYC check, create an attempt, and transition user to PENDING', async () => {
            // Arrange
            const sessionData = { sdkToken: 'mock-sdk-token', externalId: 'mock-external-id' };
            mockKycRepository.findUserById.mockResolvedValue(mockUser);
            mockKycProvider.createVerificationSession.mockResolvedValue(sessionData);

            // Act
            const result = await initiateKycCheckUseCase.execute(mockUser.id);

            // Assert
            expect(mockKycProvider.createVerificationSession).toHaveBeenCalledWith(mockUser.id, mockUser.email);
            expect(mockKycRepository.createVerificationAttempt).toHaveBeenCalledWith(expect.objectContaining({ status: KycAttemptStatus.INITIATED }));
            expect(mockKycRepository.updateUserKyc).toHaveBeenCalledWith(mockUser.id, 'PENDING', mockUser.kycTier);
            expect(result).toEqual(sessionData);
        });

        it('should throw UserNotFoundException if the user does not exist', async () => {
            mockKycRepository.findUserById.mockResolvedValue(null);
            await expect(initiateKycCheckUseCase.execute('non-existent-user')).rejects.toThrow(UserNotFoundException);
        });
    });

    describe('HandleKycWebhookUseCase', () => {
        const webhookSecret = 'test-secret';
        const mockAttempt = new KycVerificationAttempt(
            'attempt-123',
            mockUser.id,
            'SUMSUB',
            'applicant-id-123',
            KycAttemptStatus.INITIATED,
            null,
            new Date(),
        );

        beforeEach(() => {
            // Reset mocks before each test in this block
            jest.resetAllMocks();
            mockConfigService.get.mockReturnValue(webhookSecret);
            mockKycRepository.findAttemptByExternalId.mockResolvedValue(mockAttempt);
            mockKycRepository.findUserById.mockResolvedValue(mockUser);
            mockRecordWebhookEventUseCase.execute.mockResolvedValue({ isDuplicate: false, status: 'RECEIVED' });
            mockRecordWebhookEventUseCase.updateStatus.mockResolvedValue({} as any);
        });

        const createSignature = (payload: object) => {
            const rawBody = JSON.stringify(payload);
            const signature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
            return { rawBody, signature };
        };

        it('should approve user to TIER_2 on a GREEN review', async () => {
            // Arrange
            const payload: SumsubWebhookDto = {
                applicantId: 'applicant-id-123',
                externalUserId: mockUser.id,
                type: 'applicantReviewed',
                reviewResult: {
                    reviewAnswer: 'GREEN',
                },
            };
            const { rawBody, signature } = createSignature(payload);

            // Act
            const result = await handleKycWebhookUseCase.execute(rawBody, signature, payload);

            // Assert
            expect(mockKycRepository.findAttemptByExternalId).toHaveBeenCalledWith('applicant-id-123');
            expect(mockKycRepository.updateVerificationAttempt).toHaveBeenCalledWith(mockAttempt.id, KycAttemptStatus.APPROVED, null);
            expect(mockKycRepository.updateUserKyc).toHaveBeenCalledWith(mockUser.id, 'APPROVED', 'TIER_2');
            expect(result).toEqual({ success: true });
        });

        it('should reject user to NONE tier on a RED review', async () => {
            // Arrange
            const payload: SumsubWebhookDto = {
                applicantId: 'applicant-id-123',
                externalUserId: mockUser.id,
                type: 'applicantReviewed',
                reviewResult: {
                    reviewAnswer: 'RED',
                    rejectLabels: ['FORGERY'],
                    moderationComment: 'Suspicious document provided.',
                },
            };
            const { rawBody, signature } = createSignature(payload);

            // Act
            const result = await handleKycWebhookUseCase.execute(rawBody, signature, payload);

            // Assert
            expect(mockKycRepository.findAttemptByExternalId).toHaveBeenCalledWith('applicant-id-123');
            expect(mockKycRepository.updateVerificationAttempt).toHaveBeenCalledWith(
                mockAttempt.id,
                KycAttemptStatus.REJECTED,
                'Suspicious document provided.',
            );
            expect(mockKycRepository.updateUserKyc).toHaveBeenCalledWith(mockUser.id, 'REJECTED', 'NONE');
            expect(result).toEqual({ success: true });
        });

        it('should throw UnauthorizedException for an invalid signature', async () => {
            // Arrange
            const payload: SumsubWebhookDto = { applicantId: 'applicant-id-123', externalUserId: mockUser.id, type: 'applicantReviewed', reviewResult: { reviewAnswer: 'GREEN' } };
            const { rawBody } = createSignature(payload);
            const invalidSignature = 'invalid-signature';

            // Act & Assert
            await expect(handleKycWebhookUseCase.execute(rawBody, invalidSignature, payload)).rejects.toThrow(UnauthorizedException);
        });

        it('should throw BadRequestException if the verification attempt is not found', async () => {
            // Arrange
            const payload: SumsubWebhookDto = { applicantId: 'unknown-applicant-id', externalUserId: mockUser.id, type: 'applicantReviewed', reviewResult: { reviewAnswer: 'GREEN' } };
            const { rawBody, signature } = createSignature(payload);
            mockKycRepository.findAttemptByExternalId.mockResolvedValue(null);

            // Act & Assert
            await expect(handleKycWebhookUseCase.execute(rawBody, signature, payload)).rejects.toThrow(BadRequestException);
        });
    });

    describe('GetKycStatusUseCase', () => {
        it('should return the correct status, limits, and related data for a TIER_2 user', async () => {
            // Arrange
            const tier2User = { ...mockUser, kycTier: 'TIER_2', kycStatus: KycStatus.APPROVED };
            const mockDocuments = [{ id: 'doc-1' }];
            const mockAttempt = { id: 'attempt-1', status: KycAttemptStatus.APPROVED };

            mockKycRepository.findUserById.mockResolvedValue(tier2User as User);
            mockKycRepository.findDocumentsByUserId.mockResolvedValue(mockDocuments as any);
            mockKycRepository.findLatestAttemptByUserId.mockResolvedValue(mockAttempt as any);

            // Act
            const result = await getKycStatusUseCase.execute(mockUser.id);

            // Assert
            expect(result.kycTier).toBe('TIER_2');
            expect(result.kycStatus).toBe('APPROVED');
            expect(result.monthlyLimit).toBe(10000);
            expect(result.documents).toHaveLength(1);
            expect(result.latestAttempt?.status).toBe('APPROVED');
        });

        it('should return a limit of 0 for an unverified user', async () => {
            // Arrange
            mockKycRepository.findUserById.mockResolvedValue(mockUser);
            mockKycRepository.findDocumentsByUserId.mockResolvedValue([]);
            mockKycRepository.findLatestAttemptByUserId.mockResolvedValue(null);

            // Act
            const result = await getKycStatusUseCase.execute(mockUser.id);

            // Assert
            expect(result.kycTier).toBe('NONE');
            expect(result.monthlyLimit).toBe(0);
        });
    });
});