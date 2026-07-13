const request = require('supertest');
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../app.module';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';

describe('RatesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    
    prisma = app.get<PrismaService>(PrismaService);
    
    // Create test user and get token
    const testEmail = 'fx-e2e-test@factopay.com';
    const testPhone = '+12345678901';
    
    let user = await prisma.user.findUnique({ where: { email: testEmail } });
    if (user) {
      await prisma.user.delete({ where: { email: testEmail } });
    }
    
    // Register
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: testEmail, password: 'Password123!', phoneNumber: testPhone, role: 'USER' });
      
    // Login to get JWT
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: 'Password123!' });
      
    jwtToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { email: 'fx-e2e-test@factopay.com' } }).catch(() => {});
    await app.close();
  });

  it('/rates/live (GET) should return 200 and rate data', async () => {
    const response = await request(app.getHttpServer())
      .get('/rates/live?sourceCurrency=USD&targetCurrency=GHS')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    console.log('\n--- LIVE RATE RESPONSE ---');
    console.log(JSON.stringify(response.body, null, 2));
    console.log('--------------------------\n');
    
    expect(response.body.sourceCurrency).toBe('USD');
    expect(response.body.targetCurrency).toBe('GHS');
    expect(response.body.rate).toBeDefined();
    expect(response.body.timestamp).toBeDefined();
  });
});
