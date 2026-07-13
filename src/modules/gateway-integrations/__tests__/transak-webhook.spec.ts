import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
// @ts-ignore
const req: any = request.default || request;
import * as crypto from 'crypto';
import { GatewayIntegrationsModule } from '../gateway-integrations.module';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';

describe('Transak Webhook (e2e)', () => {
  let app: INestApplication;
  const webhookSecret = 'transak_test_secret';

  beforeAll(async () => {
    process.env.TRANSAK_WEBHOOK_SECRET = webhookSecret;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        EventEmitterModule.forRoot(),
        GatewayIntegrationsModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('should reject webhook with missing signature', async () => {
    const res = await req(app.getHttpServer())
      .post('/webhooks/transak')
      .send({ eventID: 'test_event' });
    
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Missing Transak signature');
  });

  it('should reject webhook with invalid signature', async () => {
    const res = await req(app.getHttpServer())
      .post('/webhooks/transak')
      .set('x-transak-signature', 'invalid_sig')
      .send({ eventID: 'test_event' });
    
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid Transak signature');
  });

  it('should process webhook with valid signature', async () => {
    const payload = { eventID: 'test_event_123', status: 'COMPLETED' };
    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    const res = await req(app.getHttpServer())
      .post('/webhooks/transak')
      .set('x-transak-signature', signature)
      .send(payload);
    
    expect(res.status).toBe(201);
    expect(res.body.received).toBe(true);
  });
});
