import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import * as request from 'supertest';
// @ts-ignore
const req: any = request.default || request;
import { B2bGatewayModule } from '../b2b-gateway.module';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { ApiKeyService } from '../application/services/api-key.service';
import { InitiateTransferUseCase } from '../../transfer-engine/application/use-cases/initiate-transfer.use-case';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

describe('B2B Gateway API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiKeyService: ApiKeyService;
  let initiateTransferUseCase: InitiateTransferUseCase;

  let testUserId = 'f7457cd3-4e3a-4f51-b079-c5c6439c2c8d'; // mock UUID
  let rawApiKey: string;

  beforeAll(async () => {
    const mockPrismaService = {
      gatewayApiKey: {
        create: jest.fn().mockResolvedValue({ id: 'key-1' }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          // If we receive the hashed key of 'valid-key', return a mock record
          return Promise.resolve({
            id: 'key-1',
            userId: testUserId,
            isActive: true,
            expiresAt: null,
          });
        }),
      },
    };

    const mockInitiateTransferUseCase = {
      execute: jest.fn().mockResolvedValue({
        id: 'transfer-1',
        status: 'CREATED',
        amount: 100,
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        B2bGatewayModule,
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
        ConfigModule.forRoot({ isGlobal: true }),
        EventEmitterModule.forRoot(),
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideProvider(InitiateTransferUseCase)
      .useValue(mockInitiateTransferUseCase)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    apiKeyService = moduleFixture.get<ApiKeyService>(ApiKeyService);
    initiateTransferUseCase = moduleFixture.get<InitiateTransferUseCase>(InitiateTransferUseCase);

    jest.spyOn(apiKeyService, 'validateApiKey').mockImplementation(async (key) => {
      if (key === 'valid-api-key') {
        return {
          id: 'key-1',
          userId: testUserId,
          isActive: true,
          expiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          keyHash: 'hash',
          rateLimitTier: 10
        } as any;
      }
      if (key === 'revoked-key') throw new UnauthorizedException('API Key has been revoked');
      throw new UnauthorizedException('Invalid API Key');
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('API Key Authentication', () => {
    it('should reject request without x-api-key header', async () => {
      const response = await req(app.getHttpServer())
        .post('/api/v1/gateway/transfers')
        .send({
          amount: 100,
          currency: 'EUR',
          destinationAddress: 'recipient_wallet',
          type: 'WALLET_TO_WALLET',
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Missing x-api-key header');
    });

    it('should reject request with invalid x-api-key', async () => {
      const response = await req(app.getHttpServer())
        .post('/api/v1/gateway/transfers')
        .set('x-api-key', 'invalid-key')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid API Key');
    });

    it('should allow request with valid x-api-key and call use case', async () => {
      const payload = {
        amount: 100,
        currency: 'EUR',
        destinationAddress: 'recipient_wallet',
        type: 'WALLET_TO_WALLET',
      };

      const response = await req(app.getHttpServer())
        .post('/api/v1/gateway/transfers')
        .set('x-api-key', 'valid-api-key')
        .set('idempotency-key', 'test-idem-123')
        .send(payload);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toMatchObject({
        id: 'transfer-1',
        status: 'CREATED',
      });
      expect(response.body.metadata).toMatchObject({
        idempotencyKey: 'test-idem-123',
      });

      // Verify the use case was called with correct arguments
      expect(initiateTransferUseCase.execute).toHaveBeenCalledWith(
        testUserId,
        payload,
        'test-idem-123',
      );
    });
  });

  describe('Tiered Rate Limiting', () => {
    it('should allow up to 10 requests but block the 11th based on rateLimitTier', async () => {
      const payload = {
        amount: 50,
        currency: 'EUR',
        destinationAddress: 'wallet2',
        type: 'WALLET_TO_WALLET',
      };

      // Mock rateLimitTier = 10
      jest.spyOn(apiKeyService, 'validateApiKey').mockImplementation(async (key) => {
        return {
          id: 'key-1',
          userId: testUserId,
          isActive: true,
          keyHash: 'hash-tier-10',
          rateLimitTier: 10
        } as any;
      });

      // Send 9 requests
      for (let i = 0; i < 9; i++) {
        const res = await req(app.getHttpServer())
          .post('/api/v1/gateway/transfers')
          .set('x-api-key', 'valid-api-key')
          .set('idempotency-key', `idem-rate-${i}`)
          .send(payload);
        expect(res.status).toBe(201);
      }

      // 10th request should be 201
      const res10 = await req(app.getHttpServer())
        .post('/api/v1/gateway/transfers')
        .set('x-api-key', 'valid-api-key')
        .set('idempotency-key', `idem-rate-10`)
        .send(payload);
      expect(res10.status).toBe(201);

      // 11th request should be 429
      const res11 = await req(app.getHttpServer())
        .post('/api/v1/gateway/transfers')
        .set('x-api-key', 'valid-api-key')
        .set('idempotency-key', `idem-rate-11`)
        .send(payload);
      
      expect(res11.status).toBe(429);
    });
    it('should respect a dynamic rateLimitTier of 5', async () => {
      const payload = {
        amount: 50,
        currency: 'EUR',
        destinationAddress: 'wallet2',
        type: 'WALLET_TO_WALLET',
      };

      // Mock rateLimitTier = 5
      jest.spyOn(apiKeyService, 'validateApiKey').mockImplementation(async (key) => {
        return {
          id: 'key-2',
          userId: testUserId,
          isActive: true,
          keyHash: 'hash-tier-5',
          rateLimitTier: 5
        } as any;
      });

      // Send 4 requests
      for (let i = 0; i < 4; i++) {
        const res = await req(app.getHttpServer())
          .post('/api/v1/gateway/transfers')
          .set('x-api-key', 'valid-api-key')
          .set('idempotency-key', `idem-rate-tier5-${i}`)
          .send(payload);
        expect(res.status).toBe(201);
      }

      // 5th request should be 201
      const res5 = await req(app.getHttpServer())
        .post('/api/v1/gateway/transfers')
        .set('x-api-key', 'valid-api-key')
        .set('idempotency-key', `idem-rate-tier5-4`)
        .send(payload);
      expect(res5.status).toBe(201);

      // 6th request should be 429
      const res6 = await req(app.getHttpServer())
        .post('/api/v1/gateway/transfers')
        .set('x-api-key', 'valid-api-key')
        .set('idempotency-key', `idem-rate-tier5-5`)
        .send(payload);
      
      expect(res6.status).toBe(429);
    });
  });
});
