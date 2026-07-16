import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
// @ts-ignore
const req: any = request.default || request;
import * as crypto from 'crypto';
import { json } from 'express';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TransakWebhookController } from '../infrastructure/controllers/transak-webhook.controller';
import { TransakSignatureMiddleware } from '../infrastructure/middleware/transak-signature.middleware';

import { RecordWebhookEventUseCase } from '../application/use-cases/record-webhook-event.use-case';

describe('Transak Webhook (e2e)', () => {
  let app: INestApplication;
  const webhookSecret = 'transak_test_secret';

  beforeAll(async () => {
    process.env.TRANSAK_WEBHOOK_SECRET = webhookSecret;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
      ],
      controllers: [TransakWebhookController],
      providers: [
        {
          provide: RecordWebhookEventUseCase,
          useValue: {
            execute: jest.fn().mockResolvedValue({ isDuplicate: false, status: 'RECEIVED' }),
            updateStatus: jest.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    app.use(
      json({
        verify: (req: any, _res, buffer) => {
          req.rawBody = Buffer.from(buffer);
        },
      }),
    );
    const signatureMiddleware = new TransakSignatureMiddleware();
    app.use('/webhooks/transak', (req, res, next) => {
      signatureMiddleware.use(req, res, next);
    });
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
