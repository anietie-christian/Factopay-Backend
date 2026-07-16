import { Test, TestingModule } from '@nestjs/testing';
import { Controller, Get, INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import * as request from 'supertest';
// @ts-ignore
const req: any = request.default || request;

@Controller('test-headers')
class TestHeadersController {
  @Get()
  getTest() {
    return { ok: true };
  }
}

describe('HTTP Security Headers (Helmet)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TestHeadersController],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Wire in Helmet exactly as in main.ts
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            fontSrc: ["'self'", 'https:', 'data:'],
            formAction: ["'self'"],
            frameAncestors: ["'self'"],
            imgSrc: ["'self'", 'data:'],
            objectSrc: ["'none'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            scriptSrcAttr: ["'none'"],
            styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
          },
        },
        crossOriginEmbedderPolicy: false,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should set secure HTTP headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy)', async () => {
    const response = await req(app.getHttpServer()).get('/test-headers');

    // Confirm that security headers are active
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
  });
});
