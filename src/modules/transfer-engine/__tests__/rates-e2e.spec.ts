process.env.REDIS_HOST = 'localhost';
jest.setTimeout(60000);
const request = require('supertest');
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../app.module';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { PiiCrypt } from '../../auth-identity/infrastructure/security/pii-crypt';

describe('RatesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    
    prisma = app.get<PrismaService>(PrismaService);
    
    // Create test user and get token
    const testEmail = 'fx-e2e-test@factopay.com';
    const testPhone = '+12345678901';
    
    // Clean up any test users by email or phone index
    await prisma.user.deleteMany({ where: { email: testEmail } });
    const phoneIndex = PiiCrypt.generateBlindIndex(testPhone);
    if (phoneIndex) {
      await prisma.user.deleteMany({ where: { phoneNumberIndex: phoneIndex } });
    }
    
    // Register
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: testEmail, password: 'Password123!', phoneNumber: testPhone, role: 'USER' });
    console.log('Registration response:', JSON.stringify(regRes.body, null, 2));

    const dbUser = await prisma.user.findUnique({ where: { id: regRes.body.userId } });
    console.log('User in Database by ID:', JSON.stringify(dbUser, null, 2));
      
    // Login to get JWT
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: 'Password123!' });
    console.log('Login response:', JSON.stringify(loginRes.body, null, 2));
      
    jwtToken = loginRes.body?.accessToken || loginRes.body?.data?.accessToken;
  });

  afterAll(async () => {
    if (prisma?.user) {
      await prisma.user.delete({ where: { email: 'fx-e2e-test@factopay.com' } }).catch(() => {});
    }
    if (app) {
      await app.close();
    }
  });

  it('/rates/live (GET) should return 200 and rate data', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/rates/live?sourceCurrency=USD&targetCurrency=GHS')
      .set('Authorization', `Bearer ${jwtToken}`);

    console.log('RATES LIVE RESPONSE STATUS:', response.status);
    console.log('RATES LIVE RESPONSE BODY:', JSON.stringify(response.body, null, 2));

    expect(response.status).toBe(200);
    console.log('--------------------------\n');
    
    expect(response.body.sourceCurrency).toBe('USD');
    expect(response.body.targetCurrency).toBe('GHS');
    expect(response.body.rate).toBeDefined();
    expect(response.body.timestamp).toBeDefined();
  });
});
