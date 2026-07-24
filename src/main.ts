// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { FactoPayExceptionFilter } from './modules/shared/infrastructure/filters/factopay-exception.filter';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { getRequiredEnv } from './config/required-env';

function saveRawBody(req: any, _res: any, buffer: Buffer) {
  if (buffer?.length) {
    req.rawBody = Buffer.from(buffer);
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const isProduction = process.env.NODE_ENV === 'production';
  const requestBodyLimit = process.env.REQUEST_BODY_LIMIT || '1mb';

  app.use(json({ limit: requestBodyLimit, verify: saveRawBody }));
  app.use(urlencoded({ extended: true, limit: requestBodyLimit, verify: saveRawBody }));

  // HTTP security headers using Helmet
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

  // Strict CORS Configuration
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : isProduction
      ? getRequiredEnv('ALLOWED_ORIGINS').split(',').map((origin) => origin.trim()).filter(Boolean)
      : [
        'https://app.factopay.com',
        'http://localhost:3000',
        'http://localhost:4000',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:4000',
      ];
  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global routing prefix
  app.setGlobalPrefix('api/v1');

  // Swagger is disabled by default in production. If it is enabled there, put it
  // behind network/auth controls at the ingress layer.
  const swaggerEnabled = !isProduction || process.env.ENABLE_SWAGGER === 'true';
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('FactoPay API')
      .setDescription('FactoPay Backend Core API Documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global Exception Filter
  app.useGlobalFilters(new FactoPayExceptionFilter());

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
